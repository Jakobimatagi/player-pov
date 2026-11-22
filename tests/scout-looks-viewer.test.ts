import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileChart } from '../src/editor/compileAdapter'
import { COVER_2_LOOK, COVER_3_LOOK } from '../src/play/cover2Look'
import { readableCompileErrors } from '../src/play/compileErrors'
import {
  groupLookOptions,
  lookParam,
  pickLook,
  watchUrl,
  type LookOption,
} from '../src/play/lookChoice'
import type { LookSource, PlaySource } from '../src/play/sourceTypes'
import { attachPlayer, cameraState, startAsPlayer, watchPlayer } from '../src/camera/cameraState'
import { startIndex, viewerAccess } from '../src/viewer/access'
import { applyPreset, findPreset } from '../src/diagram/presets'
import { blankDiagram } from '../src/diagram/model'
import { diagramDraft } from '../src/diagram/draftPreview'

const PLAY = '11111111-1111-4111-8111-111111111111'
const CHARTED = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

function source(): PlaySource {
  return JSON.parse(readFileSync('fixtures/trips-flood.source.json', 'utf8')) as PlaySource
}

describe('look selection', () => {
  it('reads ?look= and defaults to the charted look', () => {
    expect(lookParam('?look=abc')).toBe('abc')
    expect(lookParam('?look=')).toBeNull()
    expect(lookParam('')).toBeNull()
    expect(pickLook(null, CHARTED)).toEqual({ kind: 'charted', id: CHARTED })
    expect(pickLook(null, null)).toEqual({ kind: 'charted', id: null })
    expect(pickLook(CHARTED.toUpperCase(), CHARTED)).toEqual({ kind: 'charted', id: CHARTED })
    expect(pickLook(OTHER, CHARTED)).toEqual({ kind: 'chosen', id: OTHER })
  })

  it('never falls back silently on a bad look id', () => {
    expect(pickLook('cover-2', CHARTED)).toEqual({ kind: 'invalid', value: 'cover-2' })
  })

  it('builds the homework URL shape', () => {
    expect(watchUrl(PLAY)).toBe(`/watch/${PLAY}`)
    expect(watchUrl(PLAY, CHARTED, CHARTED)).toBe(`/watch/${PLAY}`)
    expect(watchUrl(PLAY, OTHER, CHARTED)).toBe(`/watch/${PLAY}?look=${OTHER}`)
  })

  it('groups the charted look, package looks, then team looks, opposite side only', () => {
    const looks: LookOption[] = [
      { id: 'a', name: 'Zeta', side: 'defense', charted: false, packages: [] },
      { id: 'b', name: 'Cover 2', side: 'defense', charted: true, packages: [] },
      { id: 'c', name: 'Bear', side: 'defense', charted: false, packages: ['Week 12'] },
      { id: 'd', name: 'Trips', side: 'offense', charted: false, packages: [] },
    ]
    const groups = groupLookOptions('offense', looks)
    expect(groups.map((g) => g.label)).toEqual([
      'Charted with this play',
      'Package: Week 12',
      'Team scout looks',
    ])
    expect(groups.flatMap((g) => g.options.map((o) => o.id))).toEqual(['b', 'c', 'a'])
    expect(groupLookOptions('defense', looks).flatMap((g) => g.options.map((o) => o.id))).toEqual([
      'd',
    ])
  })
})

const saved = vi.hoisted(() => ({
  look: null as null | {
    id: string
    name: string
    side: 'offense' | 'defense'
    version: number
    source: LookSource
  },
}))

vi.mock('../src/data/supabase', () => ({ supabase: {} }))
vi.mock('../src/data/plays', async () => {
  const { readFileSync: read } = await import('node:fs')
  const { compileChart: compile } = await import('../src/editor/compileAdapter')
  const { COVER_2_LOOK: c2 } = await import('../src/play/cover2Look')
  const src = JSON.parse(read('fixtures/trips-flood.source.json', 'utf8')) as PlaySource
  return {
    loadPlay: async () => ({
      row: {
        id: PLAY,
        team_id: 'team',
        name: 'Trips Flood',
        side: 'offense',
        current_version: 1,
        default_look_id: CHARTED,
        updated_at: '',
        published_at: null,
      },
      source: src,
      compiled: compile(src, c2).play,
      version: 1,
      look: { id: CHARTED, version: 1, source: c2 },
    }),
  }
})
vi.mock('../src/data/looks', () => ({ loadLook: async () => saved.look }))

describe('saved play against a saved look', () => {
  beforeEach(() => {
    saved.look = null
  })

  it('opens the charted look with no param', async () => {
    const { loadPlayInput } = await import('../src/play/usePlay')
    const result = await loadPlayInput({ kind: 'id', playId: PLAY })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.look?.id).toBe(CHARTED)
      expect(result.look?.playSide).toBe('offense')
      expect(result.play.count).toBe(22)
    }
  })

  it('compiles the play source against the chosen look', async () => {
    saved.look = {
      id: OTHER,
      name: 'Cover 3 Sky',
      side: 'defense',
      version: 2,
      source: COVER_3_LOOK,
    }
    const { loadPlayInput, playInputFromLocation } = await import('../src/play/usePlay')
    const input = playInputFromLocation(`?look=${OTHER}`, { playId: PLAY })
    expect(input).toEqual({ kind: 'id', playId: PLAY, lookId: OTHER })
    const result = await loadPlayInput(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.look).toMatchObject({ id: OTHER, name: 'Cover 3 Sky' })
      expect(result.play.meta.coverage).toBe('Cover 3')
      expect(result.play.meta.id).toContain(OTHER)
    }
  })

  it('shows a readable message for an unknown or unreadable look', async () => {
    const { loadPlayInput, LOOK_UNAVAILABLE } = await import('../src/play/usePlay')
    const hidden = await loadPlayInput({ kind: 'id', playId: PLAY, lookId: OTHER })
    expect(hidden.ok).toBe(false)
    if (!hidden.ok) {
      expect(hidden.heading).toBe('Couldn’t open this look')
      expect(hidden.errors[0]?.message).toBe(LOOK_UNAVAILABLE)
    }
    const junk = await loadPlayInput({ kind: 'id', playId: PLAY, lookId: 'nope' })
    expect(junk.ok).toBe(false)
    if (!junk.ok) expect(junk.errors[0]?.message).toContain('not a saved look id')
  })

  it('names the player and leg when the pair does not compile', async () => {
    const fast: LookSource = {
      ...COVER_2_LOOK,
      players: COVER_2_LOOK.players.map((p) =>
        p.slot === 'mike' ? { ...p, legs: [{ to: { dx: 30, dy: 0 }, dur: 1, label: 'wall' }] } : p,
      ),
    }
    saved.look = { id: OTHER, name: 'Fast Mike', side: 'defense', version: 1, source: fast }
    const { loadPlayInput } = await import('../src/play/usePlay')
    const result = await loadPlayInput({ kind: 'id', playId: PLAY, lookId: OTHER })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.heading).toBe('Trips Flood doesn’t compile against Fast Mike')
      const error = result.errors.find((e) => e.playerId?.includes('mike'))
      expect(error?.playerId).toBe('Look “Fast Mike” · LB #55 (mike)')
      expect(error?.path).toBe('leg 1 “wall”')
      expect(error?.message).toMatch(/too fast: 30\.0 yd\/s/)
    }
  })
})

describe('readable compile errors', () => {
  it('names a missing slot, an over-cap route and a wrong-side look', () => {
    const play = source()
    const short: LookSource = { ...COVER_2_LOOK, players: COVER_2_LOOK.players.slice(0, 10) }
    const missing = compileChart(play, short)
    const lines = readableCompileErrors(missing.errors, play, short)
    expect(lines.some((e) => /A slot is missing/.test(e.message))).toBe(true)

    const long: PlaySource = {
      ...play,
      duration: 20,
      players: play.players.map((p) =>
        p.slot === 'x'
          ? { ...p, legs: Array.from({ length: 12 }, () => ({ to: { dx: 1, dy: 0 }, dur: 1 })) }
          : p,
      ),
    }
    const over = readableCompileErrors(compileChart(long, COVER_2_LOOK).errors, long, COVER_2_LOOK)
    const x = over.find((e) => e.playerId === 'Play · WR #1 (x)' || e.playerId?.endsWith('(x)'))
    expect(x?.message).toMatch(/12 legs, over the cap of 12 waypoints/)

    const wrong = readableCompileErrors(
      compileChart(play, { ...COVER_2_LOOK, side: 'offense' }).errors,
      play,
      COVER_2_LOOK,
    )
    expect(wrong[0]?.message).toBe('This look is an offense, so pick a defense look')
  })
})

describe('player start slot', () => {
  beforeEach(() => {
    cameraState.lockedTo = -1
    cameraState.mode = 'broadcast'
    cameraState.attached = -1
    cameraState.watchAs = -1
    cameraState.povSubject = -1
  })

  it('starts a player with a slot on it, in POV', () => {
    const ids = ['qb', 'x', 'cb1', 'fs']
    const access = viewerAccess({
      backend: true,
      savedPlay: true,
      role: 'player',
      slotLoaded: true,
      slot: 'fs',
      ids,
    })
    expect(startIndex(access)).toBe(3)
    expect(startIndex({ kind: 'free', staff: true })).toBe(-1)
    expect(startIndex({ kind: 'unassigned', slot: null })).toBe(-1)
    startAsPlayer(startIndex(access), 0)
    expect(cameraState.attached).toBe(3)
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.povSubject).toBe(3)
  })

  it('keeps Watch as and attach open after the start', () => {
    startAsPlayer(3, 0)
    watchPlayer(1, 0, 0)
    expect(cameraState.attached).toBe(1)
    attachPlayer(2, 0)
    expect(cameraState.attached).toBe(2)
    expect(cameraState.lockedTo).toBe(-1)
  })
})

describe('editor draft preview', () => {
  it('turns a drawn offense and defense into a play + look that compiles', () => {
    const offense = findPreset('trips-rt')
    const defense = findPreset('d-cover2')
    expect(offense).toBeDefined()
    expect(defense).toBeDefined()
    if (offense == null || defense == null) return
    const d = applyPreset(applyPreset(blankDiagram(), offense), defense)
    const draft = diagramDraft(d, { ourSide: 'offense', name: 'Draft' })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return
    const chart = compileChart(draft.source, draft.look)
    expect(chart.errors).toEqual([])
    expect(chart.compiled?.count).toBe(22)

    const asDefense = diagramDraft(d, { ourSide: 'defense', name: 'Draft D' })
    expect(asDefense.ok).toBe(true)
    if (asDefense.ok) expect(compileChart(asDefense.source, asDefense.look).errors).toEqual([])
  })

  it('falls back to a stock look when only our side is drawn', () => {
    const offense = findPreset('trips-rt')
    if (offense == null) throw new Error('missing preset')
    const draft = diagramDraft(applyPreset(blankDiagram(), offense), {
      ourSide: 'offense',
      name: '',
    })
    expect(draft.ok).toBe(true)
    if (draft.ok) {
      expect(draft.look.id).toBe(COVER_2_LOOK.id)
      expect(compileChart(draft.source, draft.look).errors).toEqual([])
    }
  })
})
