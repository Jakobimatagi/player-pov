import { alignOrigins } from '../play/compileSource'
import type { Leg, LookPlayer, LookSource, PlaySource, SourcePlayer } from '../play/sourceTypes'
import { FORMATIONS } from './formations'
import {
  createEditorState,
  findPlayer,
  GRID,
  isLegRef,
  MAX_LEGS,
  UNDO_CAP,
  type EditorIssue,
  type EditorSnapshot,
  type EditorState,
  type LegRef,
  type PlayerRef,
  type SideKey,
  type Snap,
  type Tool,
} from './state'

/** Yards per second for a leg drawn without timing. The leg timing panel (C6) edits it. */
export const DEFAULT_SPEED = 7

type Point = { dx: number; dy: number }

/**
 * Every point an action carries (`moveAlign`, `addLeg.to`, `moveLeg.to`) is ball-relative yards:
 * dx downfield from the line of scrimmage, dy lateral from the ball (+ is the offense's left).
 * The reducer snaps it, then rewrites leg deltas so the other waypoints stay where they were.
 */
export type EditorAction =
  | {
      type: 'load'
      source: PlaySource
      look: LookSource
      playId: string | null
      baseVersion: number | null
      lookId: string | null
      lookBaseVersion: number | null
    }
  | { type: 'rename'; name: string }
  | { type: 'select'; target: PlayerRef | LegRef | null }
  | { type: 'setTool'; tool: Tool }
  | { type: 'setSnap'; snap: Snap }
  | { type: 'moveAlign'; ref: PlayerRef; dx: number; dy: number }
  /** Rejected (state unchanged) once the player has MAX_LEGS legs. */
  | { type: 'addLeg'; ref: PlayerRef; to: Point; at?: number }
  | { type: 'moveLeg'; ref: LegRef; to: Point }
  | { type: 'setLeg'; ref: LegRef; patch: Partial<Omit<Leg, 'to'>> }
  | { type: 'removeLeg'; ref: LegRef }
  | {
      type: 'setPlayer'
      ref: PlayerRef
      patch: Partial<Pick<SourcePlayer, 'position' | 'jersey' | 'role'>>
    }
  | { type: 'applyFormation'; side: SideKey; preset: string }
  | { type: 'setBall'; ball: PlaySource['ball'] }
  | { type: 'compiled'; issues: EditorIssue[] }
  | { type: 'saved'; baseVersion: number; lookBaseVersion: number | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'beginDrag' }
  | { type: 'endDrag' }

const EPS = 1e-9

/** Round to the snap grid in yards. `off` keeps the value as is. */
export function snapYards(v: number, snap: Snap): number {
  if (snap === 'off') return v
  const grid = GRID[snap]
  const snapped = Math.round(v / grid) * grid
  // Avoid -0 and float dust like 2.0000000004 in saved JSON.
  return Math.round(snapped * 1e6) / 1e6 + 0
}

function snapPoint(p: Point, snap: Snap): Point {
  return { dx: snapYards(p.dx, snap), dy: snapYards(p.dy, snap) }
}

function snapshot(s: EditorState): EditorSnapshot {
  return { source: s.source, look: s.look, name: s.name }
}

function pushCapped(stack: EditorSnapshot[], item: EditorSnapshot): EditorSnapshot[] {
  const next = [...stack, item]
  return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next
}

/** Apply an edit. Outside a drag it records one undo entry; inside a drag beginDrag already did. */
function commit(s: EditorState, edit: Partial<EditorSnapshot>): EditorState {
  const next: EditorState = { ...s, ...edit, dirty: true }
  if (s.dragging) return sanitizeSelection({ ...next, future: [] })
  return sanitizeSelection({ ...next, past: pushCapped(s.past, snapshot(s)), future: [] })
}

/** Drop a selection that no longer points at a player or leg. */
function sanitizeSelection(s: EditorState): EditorState {
  const sel = s.selection
  if (sel == null) return s
  const player = findPlayer(s, sel)
  if (player == null) return { ...s, selection: null }
  if (isLegRef(sel) && (sel.leg < -1 || sel.leg >= player.legs.length)) {
    return { ...s, selection: { side: sel.side, slot: sel.slot } }
  }
  return s
}

/** Ball-relative alignment point per player, with look anchors resolved like the compiler. */
function originRel(s: EditorState, ref: PlayerRef): Point {
  const origins = alignOrigins(s.source, s.look)
  const abs = (ref.side === 'ours' ? origins.ours : origins.theirs).get(ref.slot)
  if (abs == null) return { dx: 0, dy: 0 }
  return { dx: abs.x - origins.los, dy: abs.y - origins.ballY }
}

/** Ball-relative points: [alignment, end of leg 0, end of leg 1, …]. */
function pointsRel(s: EditorState, ref: PlayerRef, legs: readonly Leg[]): Point[] {
  const out = [originRel(s, ref)]
  let { dx, dy } = out[0] ?? { dx: 0, dy: 0 }
  for (const leg of legs) {
    dx += leg.to.dx
    dy += leg.to.dy
    out.push({ dx, dy })
  }
  return out
}

function updatePlayer(
  s: EditorState,
  ref: PlayerRef,
  fn: (player: SourcePlayer | LookPlayer) => SourcePlayer | LookPlayer | null,
): EditorState {
  const player = findPlayer(s, ref)
  if (player == null) return s
  const next = fn(player)
  if (next == null || next === player) return s
  if (ref.side === 'ours') {
    const players = s.source.players.map((p) => (p.slot === ref.slot ? (next as SourcePlayer) : p))
    return commit(s, { source: { ...s.source, players } })
  }
  const players = s.look.players.map((p) => (p.slot === ref.slot ? (next as LookPlayer) : p))
  return commit(s, { look: { ...s.look, players } })
}

function withTo(leg: Leg, to: Point): Leg {
  return { ...leg, to: { dx: to.dx + 0, dy: to.dy + 0 } }
}

function sub(a: Point, b: Point): Point {
  return { dx: a.dx - b.dx, dy: a.dy - b.dy }
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.dx - b.dx) < EPS && Math.abs(a.dy - b.dy) < EPS
}

function moveAlign(s: EditorState, ref: PlayerRef, target: Point): EditorState {
  const to = snapPoint(target, s.snap)
  return updatePlayer(s, ref, (player) => {
    const current = originRel(s, ref)
    if (samePoint(current, to)) return null
    // Shift the stored offset by the same amount, so an anchored look player keeps its anchor.
    const shift = sub(to, current)
    const align = {
      ...player.align,
      dx: player.align.dx + shift.dx,
      dy: player.align.dy + shift.dy,
    }
    return { ...player, align }
  })
}

function addLeg(s: EditorState, ref: PlayerRef, target: Point, at?: number): EditorState {
  const to = snapPoint(target, s.snap)
  return updatePlayer(s, ref, (player) => {
    const legs = player.legs
    if (legs.length >= MAX_LEGS) return null
    const index = at ?? legs.length
    if (!Number.isInteger(index) || index < 0 || index > legs.length) return null
    const points = pointsRel(s, ref, legs)
    const prev = points[index]
    if (prev == null) return null
    const delta = sub(to, prev)
    const split = legs[index]
    const nextLegs = [...legs]
    if (split == null) {
      nextLegs.push({ to: delta, speed: DEFAULT_SPEED })
    } else {
      // Inserting inside a route: the leg being split keeps its end point and its total time.
      const rest = sub(split.to, delta)
      const a = Math.hypot(delta.dx, delta.dy)
      const b = Math.hypot(rest.dx, rest.dy)
      const inserted: Leg = { to: delta }
      const remaining = withTo(split, rest)
      if (split.dur != null) {
        const ratio = a + b > EPS ? a / (a + b) : 0.5
        inserted.dur = split.dur * ratio
        remaining.dur = split.dur - inserted.dur
      } else {
        inserted.speed = split.speed ?? DEFAULT_SPEED
      }
      if (split.interp != null) inserted.interp = split.interp
      nextLegs.splice(index, 1, inserted, remaining)
    }
    return { ...player, legs: nextLegs }
  })
}

function moveLeg(s: EditorState, ref: LegRef, target: Point): EditorState {
  if (ref.leg === -1) return moveAlign(s, ref, target)
  const to = snapPoint(target, s.snap)
  return updatePlayer(s, ref, (player) => {
    const legs = player.legs
    const leg = legs[ref.leg]
    if (leg == null) return null
    const points = pointsRel(s, ref, legs)
    const prev = points[ref.leg]
    const end = points[ref.leg + 1]
    if (prev == null || end == null || samePoint(end, to)) return null
    const nextLegs = [...legs]
    nextLegs[ref.leg] = withTo(leg, sub(to, prev))
    const after = legs[ref.leg + 1]
    const afterEnd = points[ref.leg + 2]
    if (after != null && afterEnd != null) nextLegs[ref.leg + 1] = withTo(after, sub(afterEnd, to))
    return { ...player, legs: nextLegs }
  })
}

function setLeg(s: EditorState, ref: LegRef, patch: Partial<Omit<Leg, 'to'>>): EditorState {
  return updatePlayer(s, ref, (player) => {
    const leg = player.legs[ref.leg]
    if (leg == null) return null
    const next: Leg = { ...leg }
    for (const key of ['dur', 'speed', 'interp', 'face', 'label'] as const) {
      if (!(key in patch)) continue
      const value = patch[key]
      if (value === undefined) delete next[key]
      else (next as Record<typeof key, unknown>)[key] = value
    }
    // A leg is timed by dur or by speed, never both.
    if (patch.dur != null) delete next.speed
    if (patch.speed != null) delete next.dur
    const legs = [...player.legs]
    legs[ref.leg] = next
    return { ...player, legs }
  })
}

function removeLeg(s: EditorState, ref: LegRef): EditorState {
  return updatePlayer(s, ref, (player) => {
    const legs = player.legs
    const leg = legs[ref.leg]
    if (leg == null) return null
    const nextLegs = [...legs]
    const after = legs[ref.leg + 1]
    if (after == null) {
      nextLegs.splice(ref.leg, 1)
    } else {
      // The later waypoints stay put: the next leg absorbs the removed one.
      const merged = withTo(after, {
        dx: leg.to.dx + after.to.dx,
        dy: leg.to.dy + after.to.dy,
      })
      if (after.dur != null && leg.dur != null) merged.dur = after.dur + leg.dur
      nextLegs.splice(ref.leg, 2, merged)
    }
    return { ...player, legs: nextLegs }
  })
}

function setPlayer(
  s: EditorState,
  ref: PlayerRef,
  patch: Partial<Pick<SourcePlayer, 'position' | 'jersey' | 'role'>>,
): EditorState {
  return updatePlayer(s, ref, (player) => {
    const next = { ...player }
    if (patch.position != null) next.position = patch.position
    if ('jersey' in patch) {
      if (patch.jersey === undefined) delete next.jersey
      else next.jersey = patch.jersey
    }
    if ('role' in patch) {
      if (patch.role === undefined) delete next.role
      else next.role = patch.role
    }
    return next
  })
}

function applyFormation(s: EditorState, side: SideKey, preset: string): EditorState {
  const formation = FORMATIONS[preset]
  if (formation == null || formation.side !== side) return s
  // Players keep their routes when the slot survives the formation change.
  const legsOf = (players: readonly (SourcePlayer | LookPlayer)[], slot: string): Leg[] =>
    players.find((p) => p.slot === slot)?.legs ?? []
  if (side === 'ours') {
    const players: SourcePlayer[] = formation.players.map((spot) => ({
      slot: spot.slot,
      position: spot.position,
      ...(spot.jersey != null ? { jersey: spot.jersey } : {}),
      ...(spot.face != null ? { face: spot.face } : {}),
      align: { dx: spot.align.dx, dy: spot.align.dy },
      legs: legsOf(s.source.players, spot.slot),
    }))
    return commit(s, { source: { ...s.source, formation: formation.name, players } })
  }
  const players: LookPlayer[] = formation.players.map((spot) => ({
    slot: spot.slot,
    position: spot.position,
    ...(spot.jersey != null ? { jersey: spot.jersey } : {}),
    ...(spot.face != null ? { face: spot.face } : {}),
    align: { ...spot.align },
    legs: legsOf(s.look.players, spot.slot),
  }))
  return commit(s, { look: { ...s.look, players } })
}

function validTarget(s: EditorState, target: PlayerRef | LegRef | null): boolean {
  if (target == null) return true
  const player = findPlayer(s, target)
  if (player == null) return false
  if (!isLegRef(target)) return true
  return Number.isInteger(target.leg) && target.leg >= -1 && target.leg < player.legs.length
}

/** Pure. No I/O. Any action that changes nothing returns `s` itself. */
export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'load':
      return createEditorState(a)
    case 'rename':
      if (a.name === s.name) return s
      return commit(s, { name: a.name, source: { ...s.source, name: a.name } })
    case 'select':
      if (!validTarget(s, a.target)) return s
      return { ...s, selection: a.target }
    case 'setTool':
      return a.tool === s.tool ? s : { ...s, tool: a.tool }
    case 'setSnap':
      return a.snap === s.snap ? s : { ...s, snap: a.snap }
    case 'moveAlign':
      return moveAlign(s, a.ref, { dx: a.dx, dy: a.dy })
    case 'addLeg':
      return addLeg(s, a.ref, a.to, a.at)
    case 'moveLeg':
      return moveLeg(s, a.ref, a.to)
    case 'setLeg':
      return setLeg(s, a.ref, a.patch)
    case 'removeLeg':
      return removeLeg(s, a.ref)
    case 'setPlayer':
      return setPlayer(s, a.ref, a.patch)
    case 'applyFormation':
      return applyFormation(s, a.side, a.preset)
    case 'setBall':
      return a.ball === s.source.ball ? s : commit(s, { source: { ...s.source, ball: a.ball } })
    case 'compiled':
      return { ...s, issues: a.issues }
    case 'saved':
      return { ...s, baseVersion: a.baseVersion, lookBaseVersion: a.lookBaseVersion, dirty: false }
    case 'undo': {
      const prev = s.past[s.past.length - 1]
      if (prev == null || s.dragging) return s
      return sanitizeSelection({
        ...s,
        ...prev,
        past: s.past.slice(0, -1),
        future: [...s.future, snapshot(s)],
        dirty: true,
      })
    }
    case 'redo': {
      const next = s.future[s.future.length - 1]
      if (next == null || s.dragging) return s
      return sanitizeSelection({
        ...s,
        ...next,
        past: pushCapped(s.past, snapshot(s)),
        future: s.future.slice(0, -1),
        dirty: true,
      })
    }
    case 'beginDrag':
      if (s.dragging) return s
      return { ...s, dragging: true, past: pushCapped(s.past, snapshot(s)) }
    case 'endDrag': {
      if (!s.dragging) return s
      const top = s.past[s.past.length - 1]
      const unchanged =
        top != null && top.source === s.source && top.look === s.look && top.name === s.name
      // A drag that moved nothing leaves no undo entry.
      return { ...s, dragging: false, past: unchanged ? s.past.slice(0, -1) : s.past }
    }
  }
}
