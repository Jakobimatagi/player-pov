import { COVER_2_LOOK } from '../play/cover2Look'
import { FIELD_WIDTH } from '../play/coords'
import type { Leg, LookSource, PlaySide, PlaySource } from '../play/sourceTypes'
import type { Position } from '../play/types'
import { FORMATION_LIBRARY } from '../formations/library'
import { LOS_Y, VIEW_YARDS } from './geometry'
import { assignSlots, sideTokens } from './templates'
import type { Diagram, DLine, DPlayer, LineType } from './types'

/**
 * The open diagram as an unsaved play + scout look, for the viewer's draft preview
 * (`/watch/draft/<key>`). Our side is the play; the other side's tokens are the scout look.
 * An empty other side falls back to a stock look (Cover 2, or Gun Spread for a defense),
 * so a coach can check a route before charting the look, or a look before the routes.
 */

const OFFENSE_POSITION: Record<string, Position> = {
  lt: 'LT',
  lg: 'LG',
  c: 'C',
  rg: 'RG',
  rt: 'RT',
  qb: 'QB',
  rb: 'RB',
  fb: 'FB',
  x: 'WR',
  z: 'WR',
  h: 'WR',
  s: 'WR',
  y: 'TE',
  t: 'TE',
}

const OFFENSE_JERSEY: Record<string, number> = {
  lt: 76,
  lg: 66,
  c: 64,
  rg: 68,
  rt: 72,
  qb: 12,
  rb: 28,
  fb: 44,
  x: 1,
  z: 4,
  h: 11,
  s: 3,
  y: 88,
  t: 85,
}

function defensePosition(slot: string): Position {
  if (slot.startsWith('de')) return 'DE'
  if (slot.startsWith('dt')) return 'DT'
  if (slot === 'nt') return 'NT'
  if (slot.startsWith('cb')) return 'CB'
  if (slot === 'fs' || slot === 'ss') return 'S'
  return 'LB'
}

const DEFENSE_JERSEY: Record<string, number> = {
  de1: 90,
  dt1: 93,
  dt2: 97,
  de2: 95,
  nt: 99,
  w: 58,
  m: 55,
  s: 54,
  n: 52,
  m1: 50,
  m2: 51,
  i1: 56,
  i2: 57,
  cb1: 21,
  cb2: 24,
  fs: 8,
  ss: 2,
}

/** Yards per second each line ending runs at. Blocks are short and slow. */
const SPEED: Record<LineType, number> = {
  route: 6.5,
  dashedRoute: 6.5,
  checkRelease: 5,
  path: 5,
  motion: 4,
  block: 2.5,
  segmentedBlock: 2.5,
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** A normalized diagram point as yards from the ball: downfield (dx) and to the left (dy). */
function yardsOf(p: { x: number; y: number }): { dx: number; dy: number } {
  return { dx: round1((LOS_Y - p.y) * VIEW_YARDS), dy: round1((0.5 - p.x) * FIELD_WIDTH) }
}

function legsFor(token: DPlayer, lines: readonly DLine[]): Leg[] {
  const legs: Leg[] = []
  let at = yardsOf(token)
  for (const line of lines.filter((item) => item.playerId === token.id)) {
    for (const point of line.points) {
      const next = yardsOf(point)
      const to = { dx: round1(next.dx - at.dx), dy: round1(next.dy - at.dy) }
      // A leg too short to take any time would repeat a waypoint's time.
      if (Math.hypot(to.dx, to.dy) < 0.2) continue
      legs.push({ to, speed: SPEED[line.type] })
      at = next
    }
  }
  return legs
}

function players(d: Diagram, side: PlaySide) {
  const tokens = sideTokens(d, side)
  const slots = assignSlots(tokens, side)
  const used = new Set<number>()
  return tokens.map((token, i) => {
    const slot = slots[i] || `p${i + 1}`
    const position = side === 'offense' ? (OFFENSE_POSITION[slot] ?? 'WR') : defensePosition(slot)
    let jersey = (side === 'offense' ? OFFENSE_JERSEY[slot] : DEFENSE_JERSEY[slot]) ?? 30 + i
    while (used.has(jersey)) jersey += 1
    used.add(jersey)
    return {
      slot,
      position,
      jersey,
      face: side === 'offense' ? 0 : 180,
      align: yardsOf(token),
      legs: legsFor(token, d.lines),
    }
  })
}

function legTime(legs: readonly Leg[]): number {
  return legs.reduce((sum, leg) => sum + Math.hypot(leg.to.dx, leg.to.dy) / (leg.speed ?? 1), 0)
}

export type DraftResult =
  { ok: true; source: PlaySource; look: LookSource } | { ok: false; error: string }

export function diagramDraft(
  d: Diagram,
  input: { ourSide: PlaySide; name: string; yardLine?: number },
): DraftResult {
  const theirSide: PlaySide = input.ourSide === 'offense' ? 'defense' : 'offense'
  const ours = players(d, input.ourSide)
  const theirs = players(d, theirSide)
  if (ours.length === 0) {
    return { ok: false, error: `Place your ${input.ourSide} on the field first.` }
  }
  for (const [list, side] of [
    [ours, input.ourSide],
    [theirs, theirSide],
  ] as const) {
    if (list.length > 11) {
      return {
        ok: false,
        error: `The ${side} has ${list.length} players. Take off ${list.length - 11}.`,
      }
    }
  }
  const stock: LookSource =
    theirSide === 'defense'
      ? COVER_2_LOOK
      : (FORMATION_LIBRARY[0] ?? { id: 'empty', name: 'Offense', side: 'offense', players: [] })
  const look: LookSource =
    theirs.length > 0
      ? {
          id: 'draft-look',
          name: theirSide === 'defense' ? 'Drawn defense' : 'Drawn offense',
          side: theirSide,
          players: theirs,
        }
      : stock
  const longest = Math.max(
    0,
    ...ours.map((p) => legTime(p.legs)),
    ...look.players.map((p) => legTime(p.legs)),
  )
  const duration = Math.max(3, Math.ceil((longest + 0.5) * 10) / 10)
  const offense = input.ourSide === 'offense' ? ours : look.players
  const carrier =
    offense.find((p) => p.slot === 'qb') ?? offense.find((p) => p.slot === 'c') ?? offense[0]
  const qbDepth = offense.find((p) => p.slot === 'qb')?.align.dx ?? 0
  const source: PlaySource = {
    sourceVersion: 1,
    id: 'draft',
    name: input.name.trim() === '' ? 'Draft play' : input.name.trim(),
    side: input.ourSide,
    ballSpot: { yardLine: input.yardLine ?? 50, hash: 'M' },
    duration,
    players: ours,
    ball: {
      snap: qbDepth < -3 ? 'shotgun' : 'under-center',
      segments:
        carrier == null ? [] : [{ kind: 'carried', t0: 0, t1: duration, carrier: carrier.slot }],
    },
    adjustments: [],
  }
  return { ok: true, source, look }
}

/** Store the draft for `/watch/draft/<key>` and return the key. Null when storage is off. */
export function stashDraft(draft: { source: PlaySource; look: LookSource }): string | null {
  try {
    const key = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(`draft:${key}`, JSON.stringify(draft))
    return key
  } catch {
    return null
  }
}
