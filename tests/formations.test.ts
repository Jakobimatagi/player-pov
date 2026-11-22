import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { EMPTY_RULE } from '../src/data/rules'
import {
  resolveRule,
  targetLabel,
  targetsFor,
  variantCount,
  type Facing,
  type RuleVariant,
} from '../src/data/variants'
import { compileChart } from '../src/editor/compileAdapter'
import { chartLayout } from '../src/editor/state'
import {
  detectTags,
  findLibraryFormation,
  FORMATION_LIBRARY,
  LIBRARY_PREFIX,
} from '../src/formations/library'
import { buildDefenseBook, DEFENSE_TEMPLATES } from '../src/playbook/defenseTemplates'
import { STARTERS } from '../src/playbook/starters'
import { PlaySheetPage } from '../src/playsheet/PlaySheetPage'
import type { LookSource } from '../src/play/sourceTypes'

function look(id: string): LookSource {
  const found = findLibraryFormation(`${LIBRARY_PREFIX}${id}`)
  if (found == null) throw new Error(`no formation ${id}`)
  return found
}

describe('formation tags', () => {
  it('reads personnel, structure and backfield from the alignment', () => {
    const tags = Object.fromEntries(
      FORMATION_LIBRARY.map((item) => {
        const t = detectTags(item)
        return [
          item.id.slice(LIBRARY_PREFIX.length),
          `${t.structure} ${t.personnel} ${t.backfield}`,
        ]
      }),
    )
    expect(tags).toEqual({
      'gun-spread': '2x2 11 gun',
      'gun-trips-rt': '3x1 11 gun',
      'gun-bunch-rt': '3x1 11 gun',
      'empty-3x2': 'empty 10 gun',
      'ace-12': '2x2 12 pistol',
      '12-trips': '3x1 12 gun',
      'heavy-13': '3x1 13 under center',
      'i-pro-21': '2x1 21 under center',
    })
  })

  it('names the strength from the offense’s view', () => {
    expect(detectTags(look('gun-trips-rt')).strength).toBe('right')
    expect(detectTags(look('gun-spread')).strength).toBe('balanced')
    const mirrored: LookSource = {
      ...look('gun-trips-rt'),
      players: look('gun-trips-rt').players.map((p) => ({
        ...p,
        align: { dx: p.align.dx, dy: -p.align.dy },
      })),
    }
    expect(detectTags(mirrored)).toMatchObject({ structure: '3x1', strength: 'left' })
  })
})

describe('anchored defenders', () => {
  const template = DEFENSE_TEMPLATES[0]!
  const [coverThree] = buildDefenseBook(template.id)

  function spot(against: LookSource, slot: string) {
    const chart = compileChart(coverThree!.source, against)
    expect(chart.errors).toEqual([])
    const player = chart.play!.players.find((p) => p.id === slot)!
    const meta = chart.play!.meta
    return {
      dx: player.waypoints[0]!.x - meta.lineOfScrimmageX,
      dy: player.waypoints[0]!.y - meta.ballY,
    }
  }

  it('compiles every starter call against every library formation', () => {
    for (const play of buildDefenseBook(template.id)) {
      for (const formation of FORMATION_LIBRARY) {
        const chart = compileChart(play.source, formation)
        expect(chart.errors, `${play.source.name} vs ${formation.name}`).toEqual([])
      }
    }
  })

  it('rotates the strength defenders to the trips side and back', () => {
    const right = look('gun-trips-rt')
    const left: LookSource = {
      ...right,
      id: 'trips-lt',
      players: right.players.map((p) => ({ ...p, align: { dx: p.align.dx, dy: -p.align.dy } })),
    }
    // dy > 0 is the offense's left. Trips right puts the strong safety right (dy < 0).
    expect(spot(right, 'ss').dy).toBeLessThan(0)
    expect(spot(left, 'ss').dy).toBeGreaterThan(0)
    expect(spot(right, 'will').dy).toBeGreaterThan(0)
    expect(spot(left, 'will').dy).toBeLessThan(0)
    // Mirrored formations give mirrored alignments.
    expect(spot(left, 'sam').dy).toBeCloseTo(-spot(right, 'sam').dy, 5)
  })

  it('lines corners up over #1 and keeps depth from the line, not the receiver', () => {
    const bunch = look('gun-bunch-rt')
    const z = bunch.players.find((p) => p.slot === 'z')!
    const corner = spot(bunch, 'cb_s')
    expect(corner.dx).toBe(7)
    expect(corner.dy).toBeCloseTo(z.align.dy + 1, 5) // 1 yard inside (toward the ball)
  })

  it('draws mirrored drops the same way in the editor as the compiler', () => {
    const right = look('gun-trips-rt')
    const chart = compileChart(coverThree!.source, right).play!
    const layout = chartLayout({ source: coverThree!.source, look: right })
    for (const slot of ['ss', 'sam', 'will', 'cb_w']) {
      const compiled = chart.players.find((p) => p.id === slot)!.waypoints
      const drawn = layout.players.find((p) => p.ref.slot === slot)!.points
      expect(drawn[0]!.y).toBeCloseTo(compiled[0]!.y, 5)
      expect(drawn[1]!.y).toBeCloseTo(compiled[1]!.y, 5)
    }
  })

  it('leaves plays without anchors exactly where they were', () => {
    const offense = STARTERS.find((s) => s.side === 'offense')!.build()[0]!
    const chart = compileChart(offense.source, offense.look).play!
    const qb = chart.players.find((p) => p.id === 'qb')!
    const src = offense.source.players.find((p) => p.slot === 'qb')!
    expect(qb.waypoints[0]!.x - chart.meta.lineOfScrimmageX).toBe(src.align.dx)
  })
})

describe('vs exceptions', () => {
  const trips: Facing = {
    id: 'lib:gun-trips-rt',
    name: 'Gun Trips Right',
    tags: detectTags(look('gun-trips-rt')),
  }
  const base = {
    ...EMPTY_RULE,
    alignment: '12 yds middle',
    assignment: 'Deep middle',
    adjustment: 'Favor strength',
    keyRead: 'QB',
    recognize: 'Eyes',
    react: 'Break on it',
  }
  const v = (scope: RuleVariant['scope'], match: string, fields: Partial<typeof base>) =>
    ({ ...EMPTY_RULE, ...fields, slot: 'fs', side: 'defense', scope, match }) as RuleVariant

  it('lists the three layers for a formation, most specific first', () => {
    expect(targetsFor(trips)).toEqual([
      { scope: 'look', match: 'lib:gun-trips-rt' },
      { scope: 'structure', match: '3x1' },
      { scope: 'personnel', match: '11' },
    ])
    expect(targetsFor(trips).map((t) => targetLabel(t, trips))).toEqual([
      'vs Gun Trips Right',
      'vs 3x1 (trips)',
      'vs 11 personnel',
    ])
  })

  it('takes each answer from the most specific exception that has one', () => {
    const variants = [
      v('personnel', '11', { alignment: 'personnel align', keyRead: 'personnel read' }),
      v('structure', '3x1', { alignment: 'over #3', react: 'carry #3' }),
      v('look', 'lib:gun-trips-rt', { react: 'carry #3 to 15' }),
      v('structure', '2x2', { assignment: 'never used here' }),
    ]
    const { fields, from } = resolveRule(base, variants, 'fs', trips)
    expect(fields.alignment).toBe('over #3')
    expect(fields.react).toBe('carry #3 to 15')
    expect(fields.keyRead).toBe('personnel read')
    expect(fields.assignment).toBe('Deep middle')
    expect(from.alignment?.scope).toBe('structure')
    expect(from.react?.scope).toBe('look')
    expect(from.assignment).toBeUndefined()
    expect(variantCount(variants, 'fs', trips)).toBe(3)
  })

  it('never blanks an answer: an empty exception field inherits', () => {
    const { fields } = resolveRule(base, [v('structure', '3x1', { alignment: '   ' })], 'fs', trips)
    expect(fields.alignment).toBe('12 yds middle')
  })

  it('shows the base rule when nothing is faced, or for another position', () => {
    const variants = [v('structure', '3x1', { alignment: 'over #3' })]
    expect(resolveRule(base, variants, 'fs', null).fields.alignment).toBe('12 yds middle')
    expect(resolveRule(base, variants, 'ss', trips).fields.alignment).toBe('12 yds middle')
  })
})

describe('starter playbooks', () => {
  it('offers offense and defense books', () => {
    expect(STARTERS.map((s) => `${s.side}:${s.name}`)).toContain('defense:Base 4-3 Coverages')
    expect(STARTERS.filter((s) => s.side === 'offense')).toHaveLength(3)
    const defense = STARTERS.find((s) => s.side === 'defense')!
    expect(defense.build().map((p) => p.source.name)).toEqual([
      'Cover 3 Sky',
      'Cover 2',
      'Cover 1 Robber',
    ])
    expect(defense.build().every((p) => p.source.side === 'defense')).toBe(true)
  })
})

function sheet(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/plays/:playId', element: createElement(PlaySheetPage) }),
      ),
    ),
  )
}

describe('play sheet facing a formation (no backend)', () => {
  it('lets a coach pick a formation and edit each layer', () => {
    const html = sheet('/plays/cover-3?pos=fs&vs=lib:gun-trips-rt')
    expect(html).toContain('data-testid="facing"')
    expect(html).toContain('Gun Trips Right')
    expect(html).toContain('3x1 (trips) · 11 personnel · gun')
    expect(html).toContain('Every formation')
    expect(html).toContain('vs 3x1 (trips)')
    expect(html).toContain('vs 11 personnel')
    expect(html).toMatch(/3 answers change/)
  })

  it('shows a player the answers against the formation with exceptions tagged', () => {
    const html = sheet('/plays/cover-3?roster=player&vs=lib:gun-trips-rt')
    expect(html).toContain('Your job: FS #8')
    expect(html).toContain('10 yards, over #3 to the trips side.')
    expect(html).toMatch(/class="rule-vs">vs (<!-- -->)?3x1</)
    expect(html).toContain('Deep middle third.')
    expect(html).not.toContain('<textarea')
    const spread = sheet('/plays/cover-3?roster=player')
    expect(spread).toContain('12 yards, middle of the field.')
    expect(spread).not.toContain('over #3')
  })

  it('has no facing strip on an offense play yet', () => {
    expect(sheet('/plays/flood')).not.toContain('data-testid="facing"')
  })
})
