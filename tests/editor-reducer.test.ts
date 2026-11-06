import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEED, editorReducer, snapYards, type EditorAction } from '../src/editor/actions'
import {
  chartLayout,
  createEditorState,
  findPlayer,
  MAX_LEGS,
  UNDO_CAP,
  type EditorState,
  type LegRef,
  type PlayerRef,
} from '../src/editor/state'
import { COVER_2_LOOK } from '../src/play/cover2Look'
import type { Leg, PlaySource } from '../src/play/sourceTypes'

const FIXTURE = JSON.parse(readFileSync('fixtures/trips-flood.source.json', 'utf8')) as PlaySource

const H: PlayerRef = { side: 'ours', slot: 'h' }
const X: PlayerRef = { side: 'ours', slot: 'x' }
const CB_WEAK: PlayerRef = { side: 'theirs', slot: 'cb_weak' }

function fresh(): EditorState {
  return createEditorState({ source: FIXTURE, look: COVER_2_LOOK })
}

function run(s: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, s)
}

function legs(s: EditorState, ref: PlayerRef): Leg[] {
  return findPlayer(s, ref)?.legs ?? []
}

/** Ball-relative points of a player as the compiler would place them. */
function pointsRel(s: EditorState, ref: PlayerRef): { dx: number; dy: number }[] {
  const layout = chartLayout(s)
  const p = layout.players.find((q) => q.ref.side === ref.side && q.ref.slot === ref.slot)
  return (p?.points ?? []).map((pt) => ({
    dx: round(pt.x - layout.los),
    dy: round(pt.y - layout.ballY),
  }))
}

const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0

const ALL_ACTION_TYPES: EditorAction['type'][] = [
  'load',
  'rename',
  'select',
  'setTool',
  'setSnap',
  'moveAlign',
  'addLeg',
  'moveLeg',
  'setLeg',
  'removeLeg',
  'setPlayer',
  'applyFormation',
  'setBall',
  'compiled',
  'saved',
  'undo',
  'redo',
  'beginDrag',
  'endDrag',
]
const covered = new Set<EditorAction['type']>()
function cover(type: EditorAction['type']) {
  covered.add(type)
}

describe('snapYards', () => {
  it('rounds to whole yards, half yards, or not at all', () => {
    expect(snapYards(2.4, 'coarse')).toBe(2)
    expect(snapYards(2.6, 'coarse')).toBe(3)
    expect(snapYards(2.3, 'fine')).toBe(2.5)
    expect(snapYards(-0.2, 'coarse')).toBe(0)
    expect(Object.is(snapYards(-0.2, 'coarse'), -0)).toBe(false)
    expect(snapYards(2.37, 'off')).toBe(2.37)
  })
})

describe('editorReducer', () => {
  it('load replaces the chart and clears history', () => {
    cover('load')
    const edited = run(fresh(), { type: 'rename', name: 'Other' }, { type: 'select', target: H })
    const s = editorReducer(edited, {
      type: 'load',
      source: FIXTURE,
      look: COVER_2_LOOK,
      playId: 'p1',
      baseVersion: 3,
      lookId: 'l1',
      lookBaseVersion: 2,
    })
    expect(s.name).toBe('Trips Right Flood')
    expect(s.playId).toBe('p1')
    expect(s.baseVersion).toBe(3)
    expect(s.lookId).toBe('l1')
    expect(s.lookBaseVersion).toBe(2)
    expect(s.past).toEqual([])
    expect(s.future).toEqual([])
    expect(s.selection).toBeNull()
    expect(s.dirty).toBe(false)
  })

  it('rename sets the name on the state and the source, and is undoable', () => {
    cover('rename')
    const s0 = fresh()
    const s = editorReducer(s0, { type: 'rename', name: 'Flood Rt' })
    expect(s.name).toBe('Flood Rt')
    expect(s.source.name).toBe('Flood Rt')
    expect(s.dirty).toBe(true)
    expect(s.past).toHaveLength(1)
    expect(editorReducer(s, { type: 'rename', name: 'Flood Rt' })).toBe(s)
  })

  it('select takes a player, a leg, the alignment point or nothing, and rejects bad refs', () => {
    cover('select')
    const s0 = fresh()
    expect(editorReducer(s0, { type: 'select', target: H }).selection).toEqual(H)
    const leg: LegRef = { ...H, leg: 2 }
    expect(editorReducer(s0, { type: 'select', target: leg }).selection).toEqual(leg)
    expect(editorReducer(s0, { type: 'select', target: { ...H, leg: -1 } }).selection).toEqual({
      ...H,
      leg: -1,
    })
    expect(editorReducer(s0, { type: 'select', target: CB_WEAK }).selection).toEqual(CB_WEAK)
    const picked = editorReducer(s0, { type: 'select', target: H })
    expect(editorReducer(picked, { type: 'select', target: null }).selection).toBeNull()
    expect(editorReducer(s0, { type: 'select', target: { side: 'ours', slot: 'nope' } })).toBe(s0)
    expect(editorReducer(s0, { type: 'select', target: { ...H, leg: 3 } })).toBe(s0)
    expect(editorReducer(s0, { type: 'select', target: { ...X, leg: 0 } })).toBe(s0)
    // Selection is not an edit.
    expect(editorReducer(s0, { type: 'select', target: H }).past).toEqual([])
  })

  it('setTool and setSnap change mode without an undo entry', () => {
    cover('setTool')
    cover('setSnap')
    const s = run(fresh(), { type: 'setTool', tool: 'route' }, { type: 'setSnap', snap: 'fine' })
    expect(s.tool).toBe('route')
    expect(s.snap).toBe('fine')
    expect(s.past).toEqual([])
    expect(s.dirty).toBe(false)
    expect(editorReducer(s, { type: 'setTool', tool: 'route' })).toBe(s)
  })

  it('moveAlign snaps, moves the route with the player, and keeps look anchors', () => {
    cover('moveAlign')
    const s0 = fresh()
    const before = pointsRel(s0, H)
    const s = editorReducer(s0, { type: 'moveAlign', ref: H, dx: -1.4, dy: -9.2 })
    expect(findPlayer(s, H)?.align).toEqual({ dx: -1, dy: -9 })
    expect(legs(s, H)).toBe(legs(s0, H))
    const after = pointsRel(s, H)
    after.forEach((p, i) => {
      expect(p.dx).toBeCloseTo((before[i]?.dx ?? 0) + 0, 9)
      expect(p.dy).toBeCloseTo((before[i]?.dy ?? 0) - 1, 9)
    })

    const fine = run(fresh(), { type: 'setSnap', snap: 'fine' })
    expect(
      findPlayer(editorReducer(fine, { type: 'moveAlign', ref: H, dx: -1.3, dy: -8.2 }), H)?.align,
    ).toEqual({ dx: -1.5, dy: -8 })
    const off = run(fresh(), { type: 'setSnap', snap: 'off' })
    expect(
      findPlayer(editorReducer(off, { type: 'moveAlign', ref: H, dx: -1.3, dy: -8.2 }), H)?.align,
    ).toEqual({ dx: -1.3, dy: -8.2 })

    // cb_weak is anchored 1 yd off x (weak #1, at dx -1, dy 14), so it sits at (0, 14).
    expect(pointsRel(s0, CB_WEAK)[0]).toEqual({ dx: 0, dy: 14 })
    const cb = editorReducer(s0, { type: 'moveAlign', ref: CB_WEAK, dx: 6, dy: 13 })
    expect(findPlayer(cb, CB_WEAK)?.align).toEqual({ anchor: 'weak#1', dx: 7, dy: -1 })
    expect(pointsRel(cb, CB_WEAK)[0]).toEqual({ dx: 6, dy: 13 })

    // Dropping it where it already is changes nothing.
    expect(editorReducer(s0, { type: 'moveAlign', ref: H, dx: -1, dy: -8 })).toBe(s0)
    expect(
      editorReducer(s0, { type: 'moveAlign', ref: { side: 'ours', slot: 'nope' }, dx: 0, dy: 0 }),
    ).toBe(s0)
  })

  it('addLeg appends with a default speed and inserts without moving later waypoints', () => {
    cover('addLeg')
    const s0 = fresh()
    const x = editorReducer(s0, { type: 'addLeg', ref: X, to: { dx: 4.2, dy: 14 } })
    expect(legs(x, X)).toEqual([{ to: { dx: 5, dy: 0 }, speed: DEFAULT_SPEED }])

    const before = pointsRel(s0, H)
    const mid = editorReducer(s0, { type: 'addLeg', ref: H, to: { dx: 2, dy: -6 }, at: 1 })
    const after = pointsRel(mid, H)
    expect(after).toHaveLength(before.length + 1)
    expect(after[2]).toEqual({ dx: 2, dy: -6 })
    expect(after.slice(3)).toEqual(before.slice(2))
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2))
    // The split leg's time is shared, so the play's timing does not change.
    const split = legs(s0, H)[1]
    const parts = legs(mid, H).slice(1, 3)
    if (split?.dur != null) {
      expect((parts[0]?.dur ?? 0) + (parts[1]?.dur ?? 0)).toBeCloseTo(split.dur, 9)
    }

    expect(editorReducer(s0, { type: 'addLeg', ref: H, to: { dx: 0, dy: 0 }, at: 9 })).toBe(s0)
    expect(editorReducer(s0, { type: 'addLeg', ref: H, to: { dx: 0, dy: 0 }, at: -1 })).toBe(s0)
  })

  it(`enforces MAX_LEGS (${MAX_LEGS})`, () => {
    let s = fresh()
    for (let i = 0; i < MAX_LEGS; i += 1) {
      s = editorReducer(s, { type: 'addLeg', ref: X, to: { dx: i + 1, dy: 14 } })
    }
    expect(legs(s, X)).toHaveLength(MAX_LEGS)
    const rejected = editorReducer(s, { type: 'addLeg', ref: X, to: { dx: 20, dy: 14 } })
    expect(rejected).toBe(s)
    expect(editorReducer(s, { type: 'addLeg', ref: X, to: { dx: 0, dy: 14 }, at: 0 })).toBe(s)
    // The 12-waypoint cap of the compiled play holds: 1 alignment + 11 legs.
    expect(pointsRel(s, X)).toHaveLength(12)
  })

  it('moveLeg moves one waypoint and leaves the rest of the route in place', () => {
    cover('moveLeg')
    const s0 = fresh()
    const before = pointsRel(s0, H)
    const s = editorReducer(s0, {
      type: 'moveLeg',
      ref: { ...H, leg: 1 },
      to: { dx: 10.8, dy: -4 },
    })
    const after = pointsRel(s, H)
    expect(after[2]).toEqual({ dx: 11, dy: -4 })
    expect(after[1]).toEqual(before[1])
    expect(after[3]).toEqual(before[3])
    // Leg -1 is the alignment point.
    const aligned = editorReducer(s0, {
      type: 'moveLeg',
      ref: { ...H, leg: -1 },
      to: { dx: -2, dy: -8 },
    })
    expect(findPlayer(aligned, H)?.align).toEqual({ dx: -2, dy: -8 })
    expect(
      editorReducer(s0, { type: 'moveLeg', ref: { ...H, leg: 7 }, to: { dx: 0, dy: 0 } }),
    ).toBe(s0)
    expect(
      editorReducer(s0, {
        type: 'moveLeg',
        ref: { ...H, leg: 0 },
        to: before[1] ?? { dx: 0, dy: 0 },
      }),
    ).toBe(s0)
  })

  it('setLeg patches timing, interp, face and label; dur and speed exclude each other', () => {
    cover('setLeg')
    const s0 = fresh()
    const ref = { ...H, leg: 0 }
    const s = editorReducer(s0, {
      type: 'setLeg',
      ref,
      patch: { speed: 8, interp: 'linear', face: 90, label: 'release' },
    })
    expect(legs(s, H)[0]).toEqual({
      to: legs(s0, H)[0]?.to,
      speed: 8,
      interp: 'linear',
      face: 90,
      label: 'release',
    })
    const back = editorReducer(s, { type: 'setLeg', ref, patch: { dur: 1.2, label: undefined } })
    expect(legs(back, H)[0]).toEqual({
      to: legs(s0, H)[0]?.to,
      dur: 1.2,
      interp: 'linear',
      face: 90,
    })
    expect(editorReducer(s0, { type: 'setLeg', ref: { ...X, leg: 0 }, patch: { dur: 1 } })).toBe(s0)
  })

  it('removeLeg drops one waypoint and keeps the later ones in place', () => {
    cover('removeLeg')
    const s0 = fresh()
    const before = pointsRel(s0, H)
    const s = editorReducer(s0, { type: 'removeLeg', ref: { ...H, leg: 0 } })
    const after = pointsRel(s, H)
    expect(after).toEqual([before[0], ...before.slice(2)])
    const total = legs(s0, H).reduce((sum, leg) => sum + (leg.dur ?? 0), 0)
    expect(legs(s, H).reduce((sum, leg) => sum + (leg.dur ?? 0), 0)).toBeCloseTo(total, 9)
    const last = editorReducer(s0, { type: 'removeLeg', ref: { ...H, leg: 2 } })
    expect(pointsRel(last, H)).toEqual(before.slice(0, 3))
    expect(editorReducer(s0, { type: 'removeLeg', ref: { ...X, leg: 0 } })).toBe(s0)
  })

  it('removeLeg on the selected leg falls back to selecting the player', () => {
    const s = run(
      fresh(),
      { type: 'select', target: { ...H, leg: 2 } },
      { type: 'removeLeg', ref: { ...H, leg: 2 } },
    )
    expect(s.selection).toEqual(H)
  })

  it('setPlayer changes position, jersey and role', () => {
    cover('setPlayer')
    const s0 = fresh()
    const s = editorReducer(s0, {
      type: 'setPlayer',
      ref: { side: 'ours', slot: 'y' },
      patch: { position: 'WR', jersey: 9, role: 'flood-flat' },
    })
    expect(findPlayer(s, { side: 'ours', slot: 'y' })).toMatchObject({
      position: 'WR',
      jersey: 9,
      role: 'flood-flat',
    })
    const cleared = editorReducer(s, {
      type: 'setPlayer',
      ref: { side: 'ours', slot: 'y' },
      patch: { jersey: undefined },
    })
    expect(findPlayer(cleared, { side: 'ours', slot: 'y' })?.jersey).toBeUndefined()
  })

  it('applyFormation lines a side up from a preset and keeps routes on surviving slots', () => {
    cover('applyFormation')
    const moved = run(
      fresh(),
      { type: 'moveAlign', ref: X, dx: -1, dy: 20 },
      { type: 'moveAlign', ref: CB_WEAK, dx: 5, dy: 20 },
    )
    const ours = editorReducer(moved, { type: 'applyFormation', side: 'ours', preset: 'trips-rt' })
    expect(findPlayer(ours, X)?.align).toEqual({ dx: -1, dy: 14 })
    expect(legs(ours, H)).toEqual(legs(fresh(), H))
    expect(ours.source.formation).toBe('Gun Trips Right')
    const theirs = editorReducer(moved, {
      type: 'applyFormation',
      side: 'theirs',
      preset: 'cover-2',
    })
    expect(findPlayer(theirs, CB_WEAK)?.align).toEqual({ anchor: 'weak#1', dx: 1, dy: 0 })
    expect(theirs.look.players).toHaveLength(11)
    expect(editorReducer(moved, { type: 'applyFormation', side: 'ours', preset: 'cover-2' })).toBe(
      moved,
    )
    expect(editorReducer(moved, { type: 'applyFormation', side: 'ours', preset: 'nope' })).toBe(
      moved,
    )
  })

  it('setBall replaces the ball plan', () => {
    cover('setBall')
    const ball: PlaySource['ball'] = {
      snap: 'under-center',
      segments: [{ kind: 'carried', t0: 0, t1: 4, carrier: 'qb' }],
    }
    const s = editorReducer(fresh(), { type: 'setBall', ball })
    expect(s.source.ball).toBe(ball)
    expect(s.past).toHaveLength(1)
  })

  it('compiled stores issues without touching history', () => {
    cover('compiled')
    const issues = [{ ref: { ...H, leg: 1 }, message: 'Leg 2 has no time' }]
    const s = editorReducer(fresh(), { type: 'compiled', issues })
    expect(s.issues).toBe(issues)
    expect(s.past).toEqual([])
    expect(s.dirty).toBe(false)
  })

  it('saved records versions and clears dirty', () => {
    cover('saved')
    const s = run(
      fresh(),
      { type: 'rename', name: 'X' },
      { type: 'saved', baseVersion: 4, lookBaseVersion: 2 },
    )
    expect(s.dirty).toBe(false)
    expect(s.baseVersion).toBe(4)
    expect(s.lookBaseVersion).toBe(2)
  })

  it('undo and redo walk the history; a new edit clears redo', () => {
    cover('undo')
    cover('redo')
    const s0 = fresh()
    const s1 = editorReducer(s0, { type: 'moveAlign', ref: H, dx: -2, dy: -8 })
    const s2 = editorReducer(s1, { type: 'rename', name: 'Two' })
    const u1 = editorReducer(s2, { type: 'undo' })
    expect(u1.name).toBe(s1.name)
    expect(u1.source).toBe(s1.source)
    const u2 = editorReducer(u1, { type: 'undo' })
    expect(u2.source).toBe(s0.source)
    expect(u2.past).toEqual([])
    expect(editorReducer(u2, { type: 'undo' })).toBe(u2)
    const r1 = editorReducer(u2, { type: 'redo' })
    expect(r1.source).toBe(s1.source)
    const r2 = editorReducer(r1, { type: 'redo' })
    expect(r2.name).toBe('Two')
    expect(editorReducer(r2, { type: 'redo' })).toBe(r2)
    const branched = editorReducer(u1, { type: 'rename', name: 'Branch' })
    expect(branched.future).toEqual([])
  })

  it(`undo keeps at most ${UNDO_CAP} entries`, () => {
    let s = fresh()
    for (let i = 0; i < UNDO_CAP + 10; i += 1)
      s = editorReducer(s, { type: 'rename', name: `n${i}` })
    expect(s.past).toHaveLength(UNDO_CAP)
    for (let i = 0; i < UNDO_CAP; i += 1) s = editorReducer(s, { type: 'undo' })
    expect(s.name).toBe('n9')
  })

  it('undo drops a selection that no longer exists', () => {
    const s = run(
      fresh(),
      { type: 'addLeg', ref: X, to: { dx: 5, dy: 14 } },
      { type: 'select', target: { ...X, leg: 0 } },
      { type: 'undo' },
    )
    expect(s.selection).toEqual(X)
  })

  it('a drag is one undo entry, and a drag that moved nothing is none', () => {
    cover('beginDrag')
    cover('endDrag')
    const s0 = fresh()
    const dragged = run(
      s0,
      { type: 'beginDrag' },
      { type: 'moveAlign', ref: H, dx: -1, dy: -9 },
      { type: 'moveAlign', ref: H, dx: -1, dy: -10 },
      { type: 'moveAlign', ref: H, dx: -1, dy: -11 },
      { type: 'endDrag' },
    )
    expect(dragged.past).toHaveLength(1)
    expect(dragged.dragging).toBe(false)
    expect(findPlayer(dragged, H)?.align).toEqual({ dx: -1, dy: -11 })
    expect(editorReducer(dragged, { type: 'undo' }).source).toBe(s0.source)

    const withRedo = run(s0, { type: 'rename', name: 'A' }, { type: 'undo' })
    const idle = run(withRedo, { type: 'beginDrag' }, { type: 'endDrag' })
    expect(idle.past).toEqual(withRedo.past)
    expect(idle.future).toEqual(withRedo.future)
    // Undo waits for the drag to end.
    const mid = run(s0, { type: 'beginDrag' }, { type: 'moveAlign', ref: H, dx: -1, dy: -9 })
    expect(editorReducer(mid, { type: 'undo' })).toBe(mid)
    expect(editorReducer(mid, { type: 'beginDrag' })).toBe(mid)
    expect(editorReducer(s0, { type: 'endDrag' })).toBe(s0)
  })

  it('never mutates the state it is given', () => {
    const s0 = fresh()
    const frozen = JSON.stringify(s0)
    const look = JSON.stringify(COVER_2_LOOK)
    run(
      s0,
      { type: 'moveAlign', ref: H, dx: 0, dy: 0 },
      { type: 'addLeg', ref: H, to: { dx: 3, dy: 3 }, at: 0 },
      { type: 'moveLeg', ref: { ...H, leg: 2 }, to: { dx: 9, dy: 9 } },
      { type: 'setLeg', ref: { ...H, leg: 1 }, patch: { dur: 3 } },
      { type: 'removeLeg', ref: { ...H, leg: 0 } },
      { type: 'applyFormation', side: 'theirs', preset: 'cover-2' },
    )
    expect(JSON.stringify(s0)).toBe(frozen)
    expect(JSON.stringify(COVER_2_LOOK)).toBe(look)
  })

  it('has a test for every action', () => {
    expect([...covered].sort()).toEqual([...ALL_ACTION_TYPES].sort())
  })
})
