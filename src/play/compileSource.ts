import type { TokenColor } from '../diagram/types'
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
  color: TokenColor | undefined,
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
    ...(color != null ? { color } : {}),
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

/** Which side the offense's strength is on: more receivers, or the right when even. */
function strengthSide(snaps: readonly SnapPoint[]): 'L' | 'R' {
  const receivers = snaps.filter((player) => player.position === 'WR' || player.position === 'TE')
  const left = receivers.filter((player) => player.dy > 0.5).length
  const right = receivers.filter((player) => player.dy < -0.5).length
  return left > right ? 'L' : 'R'
}

interface Placement {
  origin: { x: number; y: number }
  /** +1 or -1: how a leg's `dy` maps to field y. Anchored defenders measure outside. */
  mirror: 1 | -1
}

/**
 * Where one of our players lines up. A defender with an `anchor` lines up off the
 * offense's receivers in the look (or the ball, set to the strength); everyone else is
 * fixed yards from the ball.
 */
function placeOurs(
  player: SourcePlayer,
  side: PlaySource['side'],
  lookSnaps: readonly SnapPoint[],
  los: number,
  ballY: number,
): Placement {
  const anchor = side === 'defense' ? player.anchor : undefined
  if (anchor == null || anchor === 'ball') {
    return { origin: { x: los + player.align.dx, y: ballY + player.align.dy }, mirror: 1 }
  }
  const strong = strengthSide(lookSnaps)
  const weak = strong === 'L' ? 'R' : 'L'
  const towards = anchor.startsWith('strong') ? strong : weak
  const mirror = towards === 'L' ? 1 : -1
  const base =
    anchor === 'strong' || anchor === 'weak'
      ? { y: ballY }
      : resolveAnchor(anchor, lookSnaps, ballY)
  // Depth is always from the line of scrimmage, so a receiver lined up off the ball
  // doesn't pull his defender offside.
  return {
    origin: { x: los + player.align.dx, y: base.y + mirror * player.align.dy },
    mirror,
  }
}

function mirrored(legs: readonly Leg[], mirror: 1 | -1): Leg[] {
  if (mirror === 1) return [...legs]
  return legs.map((leg) => ({ ...leg, to: { dx: leg.to.dx, dy: -leg.to.dy } }))
}

/** The look's players at the snap, for anchoring our defenders to its receivers. */
function lookSnapPoints(look: LookSource, los: number, ballY: number): SnapPoint[] {
  return look.players.map((player) => ({
    slot: player.slot,
    position: player.position,
    x: los + player.align.dx,
    y: ballY + player.align.dy,
    dy: player.align.dy,
  }))
}

export interface AlignOrigins {
  /** Absolute field yards of the line of scrimmage and the ball's lateral spot. */
  los: number
  ballY: number
  /** Absolute alignment point per slot, with look anchors resolved exactly as compileSource does. */
  ours: Map<string, { x: number; y: number }>
  theirs: Map<string, { x: number; y: number }>
  /** -1 for an anchored defender whose sideways yards flip with the strength. */
  oursMirror: Map<string, 1 | -1>
}

/** Where every player lines up at the snap. The editor draws from this so it matches the compiler. */
export function alignOrigins(
  source: PlaySource,
  look: LookSource,
  config: FieldConfig = fieldConfig(),
): AlignOrigins {
  const los = 10 + source.ballSpot.yardLine
  const ballY = hashToY(source.ballSpot.hash, config)
  const snaps = snapPoints(source, los, ballY)
  const lookSnaps = lookSnapPoints(look, los, ballY)
  const placed = source.players.map(
    (player) => [player.slot, placeOurs(player, source.side, lookSnaps, los, ballY)] as const,
  )
  const ours = new Map(placed.map(([slot, place]) => [slot, place.origin]))
  const oursMirror = new Map(placed.map(([slot, place]) => [slot, place.mirror]))
  const theirs = new Map(
    look.players.map((player) => [player.slot, lookOrigin(player, snaps, los, ballY)]),
  )
  return { los, ballY, ours, theirs, oursMirror }
}

function snapPoints(source: PlaySource, los: number, ballY: number): SnapPoint[] {
  return source.players.map((player) => ({
    slot: player.slot,
    position: player.position,
    x: los + player.align.dx,
    y: ballY + player.align.dy,
    dy: player.align.dy,
  }))
}

export interface CompileResult {
  play: PlayFile
  sourceMap: SourceMapEntry[]
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
  const snaps = snapPoints(source, los, ballY)
  const lookSnaps = lookSnapPoints(look, los, ballY)
  const ours = source.players.map((player, index) => {
    const { origin, mirror } = placeOurs(player, source.side, lookSnaps, los, ballY)
    return trackFrom(
      player.slot,
      source.side,
      player.position,
      player.jersey ?? index + 1,
      player.role,
      player.color,
      player.face,
      origin.x,
      origin.y,
      mirrored(legsFor(player, adjustment), mirror),
      index,
      `players[${player.slot}]`,
      sourceMap,
      source.duration,
    )
  })
  const theirs = look.players.map((player, index) => {
    const origin = lookOrigin(player, snaps, los, ballY)
    return trackFrom(
      player.slot,
      look.side,
      player.position,
      player.jersey ?? index + 1,
      player.role,
      player.color,
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
  return { play, sourceMap, errors }
}
