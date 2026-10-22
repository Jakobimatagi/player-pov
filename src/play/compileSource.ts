import { createHash } from 'node:crypto'
import { fieldConfig, type FieldConfig } from '../field/fieldConfig'
import type { PlayFile, PlayLoadError, PlayerTrack, Position, Waypoint } from './types'
import type {
  Adjustment,
  AnchorName,
  HashMark,
  Leg,
  LookPlayer,
  LookSource,
  PlaySource,
  SourceMapEntry,
  SourcePlayer,
} from './sourceTypes'

const MIDDLE_Y = 26.67

export function hashToY(hash: HashMark, config: FieldConfig = fieldConfig()): number {
  if (hash === 'M') return MIDDLE_Y
  const [right, left] = config.hashY
  return hash === 'L' ? left : right
}

export function yToHash(y: number, config: FieldConfig = fieldConfig()): HashMark {
  if (Math.abs(y - MIDDLE_Y) <= 0.05) return 'M'
  const [right, left] = config.hashY
  return Math.abs(y - left) < Math.abs(y - right) ? 'L' : 'R'
}

export function playChecksum(play: PlayFile): string {
  return createHash('sha256').update(canonical(play)).digest('hex')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`
  if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

interface SnapPoint {
  slot: string
  position: Position
  x: number
  y: number
  dy: number
}

function legDuration(leg: Leg): number {
  if (leg.dur != null) return leg.dur
  if (leg.speed == null || leg.speed <= 0) return 0
  return Math.hypot(leg.to.dx, leg.to.dy) / leg.speed
}

function matchingAdjustment(source: PlaySource, look: LookSource): Adjustment | undefined {
  return source.adjustments.find((adjustment) => {
    const when = adjustment.when
    if (when.lookIds != null && when.lookIds.length > 0) return when.lookIds.includes(look.id)
    if (when.coverage != null && when.front != null) {
      return when.coverage === look.coverage && when.front === look.front
    }
    if (when.coverage != null) return when.coverage === look.coverage
    if (when.front != null) return when.front === look.front
    return false
  })
}

function legsFor(player: SourcePlayer, adjustment: Adjustment | undefined): Leg[] {
  const override = adjustment?.overrides.find((item) => item.slot === player.slot)
  return override?.legs ?? player.legs
}

function trackFrom(
  slot: string,
  team: 'offense' | 'defense',
  position: Position,
  jersey: number,
  role: string | undefined,
  face: number | undefined,
  x0: number,
  y0: number,
  legs: readonly Leg[],
  playerIndex: number,
  sourcePrefix: string,
  sourceMap: SourceMapEntry[],
  duration: number,
): PlayerTrack {
  const start: Waypoint = { t: 0, x: x0, y: y0 }
  if (face != null) start.face = face
  const waypoints: Waypoint[] = [start]
  let x = x0
  let y = y0
  let t = 0
  legs.forEach((leg, legIndex) => {
    x += leg.to.dx
    y += leg.to.dy
    t += legDuration(leg)
    const point: Waypoint = { t, x, y }
    if (leg.face != null) point.face = leg.face
    if (leg.interp != null) point.interp = leg.interp
    waypoints.push(point)
    sourceMap.push({
      compiled: `players[${playerIndex}].waypoints[${legIndex + 1}]`,
      source: `${sourcePrefix}.legs[${legIndex}]`,
    })
  })
  const last = waypoints[waypoints.length - 1]
  if (last != null && last.t < duration - 1e-9) {
    waypoints.push({ t: duration, x, y, ...(last.face != null ? { face: last.face } : {}) })
  }
  return {
    id: slot,
    team,
    position,
    jersey,
    ...(role != null ? { role } : {}),
    waypoints,
  }
}

function widest(players: SnapPoint[], side: 'L' | 'R'): SnapPoint | undefined {
  const group = players.filter((player) => (side === 'L' ? player.dy > 0.5 : player.dy < -0.5))
  return group.sort((a, b) => Math.abs(b.dy) - Math.abs(a.dy))[0]
}

function resolveAnchor(
  name: AnchorName,
  snaps: readonly SnapPoint[],
  ballY: number,
): { x: number; y: number } {
  const receivers = snaps.filter((player) => player.position === 'WR' || player.position === 'TE')
  const left = receivers.filter((player) => player.dy > 0.5)
  const right = receivers.filter((player) => player.dy < -0.5)
  const strongSide: 'L' | 'R' = left.length > right.length ? 'L' : 'R'
  const weakSide: 'L' | 'R' = strongSide === 'L' ? 'R' : 'L'
  const ranked = (side: 'L' | 'R') =>
    receivers
      .filter((player) => (side === 'L' ? player.dy > 0.5 : player.dy < -0.5))
      .sort((a, b) => Math.abs(b.dy) - Math.abs(a.dy))
  if (name === 'ball') return { x: 0, y: ballY }
  const side = name.startsWith('strong') ? strongSide : weakSide
  const index = name.endsWith('#2') ? 1 : 0
  const target = ranked(side)[index] ?? widest(receivers, side)
  return target != null ? { x: target.x, y: target.y } : { x: 0, y: ballY }
}

function lookOrigin(
  player: LookPlayer,
  snaps: readonly SnapPoint[],
  los: number,
  ballY: number,
): { x: number; y: number } {
  if ('anchor' in player.align) {
    const anchor = resolveAnchor(player.align.anchor, snaps, ballY)
    const base = player.align.anchor === 'ball' ? { x: los, y: ballY } : anchor
    return { x: base.x + player.align.dx, y: base.y + player.align.dy }
  }
  return { x: los + player.align.dx, y: ballY + player.align.dy }
}

export interface CompileResult {
  play: PlayFile
  sourceMap: SourceMapEntry[]
  checksum: string
  errors: PlayLoadError[]
}

export function compileSource(
  source: PlaySource,
  look: LookSource,
  config: FieldConfig = fieldConfig(),
): CompileResult {
  const errors: PlayLoadError[] = []
  if (look.side === source.side) {
    errors.push({
      kind: 'semantic',
      path: 'look.side',
      message:
        look.side === 'defense'
          ? 'This look is a defense, so pick an offense look'
          : 'This look is an offense, so pick a defense look',
    })
  }
  const los = 10 + source.ballSpot.yardLine
  const ballY = hashToY(source.ballSpot.hash, config)
  const adjustment = matchingAdjustment(source, look)
  const sourceMap: SourceMapEntry[] = []
  const snaps: SnapPoint[] = source.players.map((player) => ({
    slot: player.slot,
    position: player.position,
    x: los + player.align.dx,
    y: ballY + player.align.dy,
    dy: player.align.dy,
  }))
  const ours = source.players.map((player, index) =>
    trackFrom(
      player.slot,
      source.side,
      player.position,
      player.jersey ?? index + 1,
      player.role,
      player.face,
      los + player.align.dx,
      ballY + player.align.dy,
      legsFor(player, adjustment),
      index,
      `players[${player.slot}]`,
      sourceMap,
      source.duration,
    ),
  )
  const theirs = look.players.map((player, index) => {
    const origin = lookOrigin(player, snaps, los, ballY)
    return trackFrom(
      player.slot,
      look.side,
      player.position,
      player.jersey ?? index + 1,
      player.role,
      player.face,
      origin.x,
      origin.y,
      player.legs,
      ours.length + index,
      `look.players[${player.slot}]`,
      sourceMap,
      source.duration,
    )
  })
  const play: PlayFile = {
    schemaVersion: 1,
    meta: {
      id:
        source.id ??
        source.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      name: source.name,
      ...(source.formation != null ? { offenseFormation: source.formation } : {}),
      ...(look.front != null ? { defenseFront: look.front } : {}),
      ...(look.coverage != null ? { coverage: look.coverage } : {}),
      ...(source.description != null ? { description: source.description } : {}),
      lineOfScrimmageX: los,
      ballY,
      duration: source.duration,
      offenseDirection: '+x',
    },
    players: [...ours, ...theirs],
    ball: { segments: source.ball.segments.map((segment) => ({ ...segment })) },
  }
  return { play, sourceMap, checksum: playChecksum(play), errors }
}
