import { describe, expect, it } from 'vitest'
import { templateErrorText, templateFromRow } from '../src/data/formationTemplates'
import { diagramFromFormation } from '../src/diagram/formations'
import { blankDiagram } from '../src/diagram/model'
import { applyPreset, findPreset, type Preset } from '../src/diagram/presets'
import { newScript, parseScript } from '../src/diagram/script'
import { memoryBackend } from '../src/diagram/templateStore'
import {
  assignSlots,
  baseAlignmentTemplates,
  copyName,
  liveTemplates,
  resolveFormation,
  sideTokens,
  spotsError,
  spotsFromDiagram,
  templateIdOf,
  templateKey,
  templateLook,
  templateNameError,
  templatePreset,
  type FormationTemplate,
} from '../src/diagram/templates'
import type { Diagram } from '../src/diagram/types'
import { detectTags } from '../src/formations/library'

const ID = '11111111-2222-4333-8444-555555555555'

function template(over: Partial<FormationTemplate> = {}): FormationTemplate {
  const preset = findPreset('trips-rt')!
  return {
    id: ID,
    side: 'offense',
    name: 'Our Trips',
    spots: preset.spots.slice(),
    archivedAt: null,
    ...over,
  }
}

const withPreset = (key: string, d: Diagram = blankDiagram()) => applyPreset(d, findPreset(key)!)

/** The same diagram with every token's slot forgotten, as if a coach placed them by hand. */
const handPlaced = (d: Diagram): Diagram => ({
  ...d,
  players: d.players.map((p) => without(p, 'slot')),
})

function without<T extends object>(item: T, ...keys: (keyof T)[]): T {
  const copy = { ...item }
  for (const key of keys) delete copy[key]
  return copy
}

function closeTo(a: Preset['spots'], b: Preset['spots']) {
  const bySlot = new Map(b.map((spot) => [spot.slot, spot]))
  for (const spot of a) {
    const other = bySlot.get(spot.slot)
    expect(other, spot.slot).toBeDefined()
    expect(Math.abs(spot.dx - other!.dx)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(spot.dy - other!.dy)).toBeLessThanOrEqual(0.1)
  }
}

describe('template keys', () => {
  it('prefixes ids so they never clash with built-in keys', () => {
    expect(templateKey(ID)).toBe(`tpl:${ID}`)
    expect(templateIdOf(`tpl:${ID}`)).toBe(ID)
    expect(templateIdOf('trips-rt')).toBeNull()
    expect(templateIdOf('tpl:')).toBeNull()
    expect(templateIdOf(null)).toBeNull()
  })

  it('resolves a built-in first, then a team template, archived ones included', () => {
    expect(resolveFormation('trips-rt', [template()])?.name).toBe('Gun Trips Right')
    expect(resolveFormation(`tpl:${ID}`, [template()])?.name).toBe('Our Trips')
    expect(resolveFormation(`tpl:${ID}`, [template({ archivedAt: '2026-11-20' })])?.name).toBe(
      'Our Trips',
    )
    expect(resolveFormation(`tpl:${ID}`, [])).toBeUndefined()
    expect(resolveFormation('nope', [template()])).toBeUndefined()
  })

  it('gives the same preset object for a template, so previews memoize', () => {
    const t = template()
    expect(templatePreset(t)).toBe(templatePreset(t))
    expect(templatePreset(t).key).toBe(`tpl:${ID}`)
  })
})

describe('base alignment from a template', () => {
  it('starts a play from a saved offense template instead of the blank line', () => {
    const d = diagramFromFormation(`tpl:${ID}`, [template()])
    expect(d.players).toHaveLength(11)
    expect(d.formation).toBe('Our Trips')
  })

  it('falls back to the blank line when the template is unknown or a defense', () => {
    expect(diagramFromFormation(`tpl:${ID}`).players).toHaveLength(5)
    const defense = template({ side: 'defense', spots: findPreset('d-43')!.spots.slice() })
    expect(diagramFromFormation(`tpl:${ID}`, [defense]).players).toHaveLength(5)
  })

  it('offers live offense templates, plus a deleted one the book already uses', () => {
    const live = template({ id: 'a', name: 'B live' })
    const gone = template({ id: 'b', name: 'A gone', archivedAt: '2026-11-20' })
    const other = template({ id: 'c', name: 'C other', archivedAt: '2026-11-20' })
    const defense = template({ id: 'd', side: 'defense', spots: findPreset('d-43')!.spots.slice() })
    const all = [live, gone, other, defense]
    expect(baseAlignmentTemplates(all, null).map((t) => t.id)).toEqual(['a'])
    expect(baseAlignmentTemplates(all, 'tpl:b').map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('saving a side of the diagram', () => {
  it('round-trips a preset: applying the saved spots puts every player back', () => {
    for (const key of ['i-form', 'ace', 'gun-spread', 'trips-lt', 'empty']) {
      const d = withPreset(key)
      const result = spotsFromDiagram(d, 'offense')
      if ('error' in result) throw new Error(result.error)
      closeTo(result.spots, findPreset(key)!.spots)
      const again = applyPreset(blankDiagram(), {
        key: 'tpl:x',
        name: 'Saved',
        side: 'offense',
        spots: result.spots,
      })
      expect(
        again.players.map((p) => [p.slot, p.label, p.color, p.x.toFixed(3), p.y.toFixed(3)]),
      ).toEqual(d.players.map((p) => [p.slot, p.label, p.color, p.x.toFixed(3), p.y.toFixed(3)]))
    }
  })

  it('saves one side only and keeps the other off the template', () => {
    const d = withPreset('d-43', withPreset('pro-rt'))
    const offense = spotsFromDiagram(d, 'offense')
    const defense = spotsFromDiagram(d, 'defense')
    if ('error' in offense || 'error' in defense) throw new Error('expected spots')
    expect(offense.spots.map((s) => s.slot)).toContain('qb')
    expect(defense.spots.map((s) => s.slot)).toContain('fs')
    expect(defense.spots.every((s) => s.dx > 0)).toBe(true)
  })

  it('keeps a moved player where the coach dragged him', () => {
    const d = withPreset('trips-rt')
    const moved: Diagram = {
      ...d,
      players: d.players.map((p) => (p.slot === 'h' ? { ...p, x: p.x - 0.1 } : p)),
    }
    const result = spotsFromDiagram(moved, 'offense')
    if ('error' in result) throw new Error(result.error)
    const h = result.spots.find((s) => s.slot === 'h')!
    expect(h.dy).toBeCloseTo(-8 + 5.3, 1)
  })

  it('works out slots for hand-placed offense tokens', () => {
    const tokens = sideTokens(handPlaced(withPreset('i-form')), 'offense')
    const slots = assignSlots(tokens, 'offense')
    expect(new Set(slots).size).toBe(11)
    expect(slots).toEqual(['lt', 'lg', 'c', 'rg', 'rt', 'qb', 'fb', 'rb', 'x', 'z', 'y'])
  })

  it('works out slots for hand-placed defenders by depth', () => {
    const tokens = sideTokens(handPlaced(withPreset('d-43')), 'defense')
    expect(assignSlots(tokens, 'defense')).toEqual([
      'de1',
      'dt1',
      'dt2',
      'de2',
      'w',
      'm',
      's',
      'cb1',
      'cb2',
      'fs',
      'ss',
    ])
  })

  it('infers slots from geometry when tokens carry no slot and no label', () => {
    const d = withPreset('gun-spread')
    const bare: Diagram = {
      ...d,
      players: d.players.map((p) => without(p, 'slot', 'label')),
    }
    const result = spotsFromDiagram(bare, 'offense')
    if ('error' in result) throw new Error(result.error)
    const slotAt = (dy: number) => result.spots.find((s) => Math.abs(s.dy - dy) < 0.2)?.slot
    expect(slotAt(4)).toBe('lt')
    expect(slotAt(0)).toBe('c')
    expect(slotAt(16)).toBe('x')
    expect(slotAt(-16)).toBe('z')
    expect(result.spots.find((s) => s.dx === -5 && s.dy === 0)?.slot).toBe('qb')
  })

  it('refuses a side without exactly 11 players', () => {
    const result = spotsFromDiagram(blankDiagram(), 'offense')
    expect(result).toEqual({ error: 'A formation needs 11 offense players. The field has 5.' })
    expect(spotsFromDiagram(withPreset('trips-rt'), 'defense')).toEqual({
      error: 'A formation needs 11 defense players. The field has 0.',
    })
  })

  it('keeps the token slot through a saved script', () => {
    const script = newScript(withPreset('trips-rt'))
    const parsed = parseScript(JSON.parse(JSON.stringify(script)))
    expect(parsed?.plays[0]?.diagram.players.map((p) => p.slot)).toContain('h')
  })
})

describe('template rules', () => {
  it('rejects names already used on the same side, ignoring case', () => {
    const list = [template()]
    expect(templateNameError('our trips', 'offense', list)).toBe(
      'You already have an offense formation named “our trips”.',
    )
    expect(templateNameError('Our Trips', 'defense', list)).toBeNull()
    expect(templateNameError('Our Trips', 'offense', list, ID)).toBeNull()
    expect(templateNameError('Our Trips', 'offense', [template({ archivedAt: 'x' })])).toBeNull()
    expect(templateNameError('  ', 'offense', list)).toBe('Name the formation.')
    expect(templateNameError('x'.repeat(41), 'offense', list)).toBe(
      'Keep the name to 40 characters.',
    )
  })

  it('checks spots like the database does', () => {
    const spots = template().spots
    expect(spotsError('offense', spots)).toBeNull()
    expect(spotsError('offense', spots.slice(1))).toMatch(/needs 11 offense players/)
    expect(spotsError('defense', spots)).toMatch(/isn’t a defense slot/)
    const twice = spots.map((s, i) => (i === 10 ? { ...s, slot: 'x' } : s))
    expect(spotsError('offense', twice)).toMatch(/share the X slot/)
    const wing = spots.map((s, i) => (i === 10 ? { ...s, slot: 'wing' } : s))
    expect(spotsError('offense', wing)).toMatch(/isn’t a offense slot/)
    const off = spots.map((s, i) => (i === 10 ? { ...s, dy: 40 } : s))
    expect(spotsError('offense', off)).toBe('Every player must be on the field.')
  })

  it('names a duplicate of a built-in without clashing', () => {
    expect(copyName('Gun Spread', 'offense', [])).toBe('Gun Spread (copy)')
    const taken = [template({ name: 'Gun Spread (copy)' })]
    expect(copyName('Gun Spread', 'offense', taken)).toBe('Gun Spread (copy 2)')
    expect(copyName('x'.repeat(40), 'offense', []).length).toBeLessThanOrEqual(40)
  })

  it('lists live templates by name, one side at a time', () => {
    const list = [
      template({ id: '1', name: 'Zebra' }),
      template({ id: '2', name: 'Alpha' }),
      template({ id: '3', name: 'Gone', archivedAt: 'x' }),
      template({ id: '4', side: 'defense', name: 'D' }),
    ]
    expect(liveTemplates(list, 'offense').map((t) => t.name)).toEqual(['Alpha', 'Zebra'])
  })
})

describe('saving, renaming and deleting', () => {
  it('saves, rejects a duplicate name, archives and frees the name', async () => {
    const store = memoryBackend()
    const saved = await store.create({
      side: 'offense',
      name: ' Our Wing ',
      spots: template().spots,
    })
    expect(saved.name).toBe('Our Wing')
    await expect(
      store.create({ side: 'offense', name: 'our wing', spots: template().spots }),
    ).rejects.toThrow('You already have an offense formation named “our wing”.')
    await expect(
      store.create({ side: 'defense', name: 'Bad', spots: template().spots }),
    ).rejects.toThrow(/defense slot/)
    const renamed = await store.update(saved, { name: 'Our Wing Right' })
    expect(renamed.name).toBe('Our Wing Right')
    const archived = await store.archive(renamed)
    expect(archived.archivedAt).not.toBeNull()
    // Still there for books that use it, but out of the pickers.
    const all = await store.list()
    expect(all).toHaveLength(1)
    expect(liveTemplates(all, 'offense')).toHaveLength(0)
    expect(resolveFormation(templateKey(saved.id), all)?.name).toBe('Our Wing Right')
    await expect(
      store.create({ side: 'offense', name: 'Our Wing Right', spots: template().spots }),
    ).resolves.toMatchObject({ name: 'Our Wing Right' })
  })

  it('applies a saved template like a built-in, replacing that side only', async () => {
    const store = memoryBackend()
    const saved = await store.create({
      side: 'offense',
      name: 'Ours',
      spots: findPreset('bunch-rt')!.spots,
    })
    const start = withPreset('d-43', withPreset('pro-rt'))
    const next = applyPreset(start, templatePreset(saved))
    expect(next.formation).toBe('Ours')
    expect(next.players.filter((p) => p.side === 'defense')).toEqual(
      start.players.filter((p) => p.side === 'defense'),
    )
    expect(next.players.filter((p) => p.side === 'offense')).toHaveLength(11)
  })
})

describe('templates on the Facing strip', () => {
  it('turns an offense template into a tagged look', () => {
    const look = templateLook(template())
    expect(look?.id).toBe(`tpl:${ID}`)
    expect(look?.players).toHaveLength(11)
    expect(detectTags(look!)).toMatchObject({ structure: '3x1', backfield: 'gun' })
  })

  it('has no look for a defense template', () => {
    expect(templateLook(template({ side: 'defense' }))).toBeNull()
  })
})

describe('template rows', () => {
  it('parses a row and refuses one with broken spots', () => {
    const row = {
      id: ID,
      side: 'offense' as const,
      name: 'Ours',
      spots: template().spots as never,
      archived_at: null,
    }
    expect(templateFromRow(row)?.spots).toHaveLength(11)
    expect(templateFromRow({ ...row, spots: [{ slot: 1 }] })).toBeNull()
  })

  it('explains database errors in words', () => {
    expect(templateErrorText({ code: '23505', message: 'dup' }, 'offense', 'Ours')).toBe(
      'You already have an offense formation named “Ours”.',
    )
    expect(templateErrorText({ code: '42501', message: 'rls' }, 'defense')).toBe(
      'You can’t save defense formations.',
    )
  })
})
