import { HASH_Y } from '../field/fieldConfig'
import { FIELD_LENGTH, FIELD_WIDTH } from '../play/coords'
import type { PlayFile, Team } from '../play/types'
import { watchLabel } from '../ui/watchLabel'

/**
 * Pure layout for the play board: a vertical slice of field with the offense moving up,
 * every player at their alignment, and the path each one runs after the snap. Units are
 * yards, so the SVG viewBox is the layout's width and height.
 */

export interface BoardPoint {
  x: number
  y: number
}

export interface BoardPlayer {
  id: string
  team: Team
  position: string
  jersey: number
  /** Short mark drawn on the chip: `QB`, `X`, `M`, `FS`. */
  mark: string
  /** Full name for lists and screen readers: `QB #7`, `Mike #44`. */
  label: string
  /** True for the side the play is written for. Those positions owe all six answers. */
  ours: boolean
  align: BoardPoint
  /** Alignment first, then each later waypoint. One point means the player holds. */
  path: BoardPoint[]
}

export interface BoardLayout {
  width: number
  height: number
  /** Screen y of the line of scrimmage. */
  los: number
  ball: BoardPoint
  /** Screen y and the yard-line number printed beside it (null between the 10s). */
  yardLines: { y: number; number: number | null }[]
  /** Screen x of the two hash columns. */
  hashes: [number, number]
  /** Screen y of every 1-yard hash tick in view. */
  ticks: number[]
  sidelines: [number, number]
  players: BoardPlayer[]
}

export const BOARD_MARGIN = 2
const BEHIND_MIN = 8
const AHEAD_MIN = 14
/**
 * Depth is drawn 1.3x taller than width, like a hand-drawn diagram, so the two lines
 * at the ball don't sit on top of each other.
 */
export const DEPTH_SCALE = 1.3
const PAD = 3

/** Chip text: line and skill slots by name, linebackers by initial, safeties by slot. */
export function boardMark(id: string, position: string, team: Team): string {
  if (team === 'offense') {
    if (/^[a-z]{1,2}$/.test(id)) return id.toUpperCase()
    return position
  }
  if (position === 'LB') return id.charAt(0).toUpperCase()
  if (position === 'S' || position === 'CB') return id.slice(0, 2).toUpperCase()
  return position
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function boardLayout(
  play: PlayFile,
  ourSide: Team,
  hashRule: keyof typeof HASH_Y = 'NFHS',
): BoardLayout {
  const losX = play.meta.lineOfScrimmageX
  let minX = losX - BEHIND_MIN
  let maxX = losX + AHEAD_MIN
  for (const player of play.players) {
    for (const wp of player.waypoints) {
      minX = Math.min(minX, wp.x - PAD)
      maxX = Math.max(maxX, wp.x + PAD)
    }
  }
  const x0 = clamp(Math.floor(minX), 0, FIELD_LENGTH)
  const x1 = clamp(Math.ceil(maxX), 0, FIELD_LENGTH)
  const width = FIELD_WIDTH + BOARD_MARGIN * 2
  const height = (x1 - x0) * DEPTH_SCALE + BOARD_MARGIN * 2
  // Offense moves up; y = 0 is the offense's right sideline, so it sits on the right.
  const at = (x: number, y: number): BoardPoint => ({
    x: round(BOARD_MARGIN + (FIELD_WIDTH - y)),
    y: round(BOARD_MARGIN + (x1 - x) * DEPTH_SCALE),
  })

  const yardLines: BoardLayout['yardLines'] = []
  const ticks: number[] = []
  for (let x = Math.ceil(x0); x <= x1; x += 1) {
    if (x < 10 || x > 110) continue
    if (x % 5 === 0) {
      const yard = x - 10
      const number = yard % 10 === 0 && yard > 0 && yard < 100 ? Math.min(yard, 100 - yard) : null
      yardLines.push({ y: at(x, 0).y, number })
    } else {
      ticks.push(at(x, 0).y)
    }
  }
  const [hashRight, hashLeft] = HASH_Y[hashRule]

  const players: BoardPlayer[] = play.players.map((player) => {
    const path = player.waypoints.map((wp) => at(wp.x, wp.y))
    return {
      id: player.id,
      team: player.team,
      position: player.position,
      jersey: player.jersey,
      mark: boardMark(player.id, player.position, player.team),
      label: watchLabel(player.id, player.position, player.jersey),
      ours: player.team === ourSide,
      align: path[0] ?? at(losX, play.meta.ballY),
      path: dedupe(path),
    }
  })

  return {
    width: round(width),
    height: round(height),
    los: at(losX, 0).y,
    ball: at(losX, play.meta.ballY),
    yardLines,
    hashes: [at(0, hashLeft).x, at(0, hashRight).x],
    ticks,
    sidelines: [BOARD_MARGIN, round(BOARD_MARGIN + FIELD_WIDTH)],
    players,
  }
}

/** Players left to right as the board shows them, ours first. */
export function boardOrder(players: readonly BoardPlayer[]): BoardPlayer[] {
  return [...players].sort((a, b) => {
    if (a.ours !== b.ours) return a.ours ? -1 : 1
    return a.align.x - b.align.x || a.align.y - b.align.y
  })
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function dedupe(points: BoardPoint[]): BoardPoint[] {
  const out: BoardPoint[] = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (last != null && Math.abs(last.x - point.x) < 0.05 && Math.abs(last.y - point.y) < 0.05) {
      continue
    }
    out.push(point)
  }
  return out
}
