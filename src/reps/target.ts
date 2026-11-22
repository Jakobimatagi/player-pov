import { DEPTH_SCALE, type BoardLayout, type BoardPoint } from '../playsheet/board'
import type { PlayFile } from '../play/types'

/**
 * Scout rep geometry. A spot is yards from the ball at the snap, like the editor's legs:
 * `x` downfield for the offense, `y` toward the offense's left sideline. The database
 * stores targets and attempts this way, so they don't move with the ball spot.
 */
export interface RepSpot {
  x: number
  y: number
}

export const DEFAULT_TOLERANCE = 2
export const MIN_TOLERANCE = 1
export const MAX_TOLERANCE = 10

/** The bounds the database accepts (scout_reps and rep_attempts check constraints). */
const MAX_X = 120
const MAX_Y = 60

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Where a slot finishes on the play as compiled against the rep's look: its last waypoint,
 * relative to the ball. Null when the play has no such player.
 */
export function defaultTarget(play: PlayFile, slot: string): RepSpot | null {
  const player = play.players.find((item) => item.id === slot)
  const last = player?.waypoints[player.waypoints.length - 1]
  if (last == null) return null
  return {
    x: round2(last.x - play.meta.lineOfScrimmageX),
    y: round2(last.y - play.meta.ballY),
  }
}

/** Where a slot lines up, relative to the ball. */
export function alignSpot(play: PlayFile, slot: string): RepSpot | null {
  const first = play.players.find((item) => item.id === slot)?.waypoints[0]
  if (first == null) return null
  return {
    x: round2(first.x - play.meta.lineOfScrimmageX),
    y: round2(first.y - play.meta.ballY),
  }
}

export function clampTolerance(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TOLERANCE
  return Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, Math.round(value * 2) / 2))
}

export function distanceYd(a: RepSpot, b: RepSpot): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface RepScore {
  distance: number
  passed: boolean
}

/**
 * The same scoring as public.submit_rep_attempt: straight-line yards from the target, a
 * pass inside the circle (edge included). The server is the judge; this runs only in demo
 * mode and for tests.
 */
export function scoreAttempt(target: RepSpot, tolerance: number, spot: RepSpot): RepScore {
  const distance = distanceYd(target, spot)
  return { distance, passed: distance <= tolerance }
}

/** A spot the database will take: finite and on the field. */
export function isValidSpot(spot: RepSpot): boolean {
  return (
    Number.isFinite(spot.x) &&
    Number.isFinite(spot.y) &&
    Math.abs(spot.x) <= MAX_X &&
    Math.abs(spot.y) <= MAX_Y
  )
}

/** Ball-relative yards to the board's SVG units (offense moving up, depth stretched). */
export function toBoard(layout: Pick<BoardLayout, 'ball' | 'los'>, spot: RepSpot): BoardPoint {
  return { x: layout.ball.x - spot.y, y: layout.los - spot.x * DEPTH_SCALE }
}

/** Board SVG units back to ball-relative yards, rounded to a tenth. */
export function fromBoard(layout: Pick<BoardLayout, 'ball' | 'los'>, point: BoardPoint): RepSpot {
  return {
    x: Math.round(((layout.los - point.y) / DEPTH_SCALE) * 10) / 10,
    y: Math.round((layout.ball.x - point.x) * 10) / 10,
  }
}

/** Keep a dragged point on the board. */
export function clampToBoard(
  layout: Pick<BoardLayout, 'width' | 'height'>,
  point: BoardPoint,
): BoardPoint {
  return {
    x: Math.min(layout.width, Math.max(0, point.x)),
    y: Math.min(layout.height, Math.max(0, point.y)),
  }
}

/**
 * The play as the player sees it before answering: their own route is cut back to where
 * they line up, so the board doesn't give the answer away.
 */
export function hideRoute(layout: BoardLayout, slot: string): BoardLayout {
  return {
    ...layout,
    players: layout.players.map((player) =>
      player.id === slot ? { ...player, path: [player.align] } : player,
    ),
  }
}

/** "8 yds downfield, 3 yds left" from the player's side of the ball. */
export function describeSpot(spot: RepSpot, side: 'offense' | 'defense'): string {
  // A defender faces the other way: downfield and left/right flip.
  const depth = side === 'offense' ? spot.x : -spot.x
  const lateral = side === 'offense' ? spot.y : -spot.y
  const d = Math.abs(depth)
  const l = Math.abs(lateral)
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString()
  const down = d < 0.25 ? 'on the line' : `${fmt(d)} yds ${depth > 0 ? 'downfield' : 'behind the ball'}`
  const across = l < 0.25 ? 'over the ball' : `${fmt(l)} yds ${lateral > 0 ? 'left' : 'right'}`
  return `${down}, ${across}`
}

export function yardsLabel(distance: number): string {
  const rounded = Math.round(distance * 10) / 10
  return `${rounded} yd${rounded === 1 ? '' : 's'}`
}

export type HomeworkState = 'todo' | 'overdue' | 'retry' | 'passed'

/** A rep on Player Home: passed, tried and missed, overdue, or not started. */
export function homeworkState(
  item: { attempts: number; passed: boolean; dueAt: string | null },
  now: Date,
): HomeworkState {
  if (item.passed) return 'passed'
  if (item.dueAt != null && new Date(item.dueAt).getTime() < now.getTime()) return 'overdue'
  if (item.attempts > 0) return 'retry'
  return 'todo'
}

/** Sort for Player Home: work left first (overdue, then by due date), passed last. */
export function sortHomework<T extends { attempts: number; passed: boolean; dueAt: string | null }>(
  items: readonly T[],
  now: Date,
): T[] {
  const rank: Record<HomeworkState, number> = { overdue: 0, retry: 1, todo: 1, passed: 2 }
  const due = (item: T) => (item.dueAt == null ? Number.POSITIVE_INFINITY : Date.parse(item.dueAt))
  return [...items].sort(
    (a, b) => rank[homeworkState(a, now)] - rank[homeworkState(b, now)] || due(a) - due(b),
  )
}
