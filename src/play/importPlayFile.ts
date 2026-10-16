import type { PlayFile, PlayerTrack, Waypoint } from './types'
import { yToHash } from './compileSource'
import type { Leg, LookPlayer, LookSource, PlaySource, SourcePlayer } from './sourceTypes'

function legsFrom(waypoints: readonly Waypoint[]): { face?: number; legs: Leg[] } {
  const first = waypoints[0]
  const legs: Leg[] = []
  for (let i = 1; i < waypoints.length; i += 1) {
    const prev = waypoints[i - 1]
    const next = waypoints[i]
    if (prev == null || next == null) continue
    const leg: Leg = {
      to: { dx: next.x - prev.x, dy: next.y - prev.y },
      dur: next.t - prev.t,
    }
    if (next.face != null) leg.face = next.face
    if (next.interp != null) leg.interp = next.interp
    legs.push(leg)
  }
  return { ...(first?.face != null ? { face: first.face } : {}), legs }
}

function toSourcePlayer(player: PlayerTrack, los: number, ballY: number): SourcePlayer {
  const snap = player.waypoints[0]
  const built = legsFrom(player.waypoints)
  return {
    slot: player.id,
    position: player.position,
    jersey: player.jersey,
    ...(player.role != null ? { role: player.role } : {}),
    ...(built.face != null ? { face: built.face } : {}),
    align: { dx: (snap?.x ?? los) - los, dy: (snap?.y ?? ballY) - ballY },
    legs: built.legs,
  }
}

function toLookPlayer(player: PlayerTrack, los: number, ballY: number): LookPlayer {
  const source = toSourcePlayer(player, los, ballY)
  return {
    slot: source.slot,
    position: source.position,
    ...(source.jersey != null ? { jersey: source.jersey } : {}),
    ...(source.role != null ? { role: source.role } : {}),
    ...(source.face != null ? { face: source.face } : {}),
    align: source.align,
    legs: source.legs,
  }
}

/** Lossless import. Our 11 become the source. The other 11 become a ball-relative look. */
export function importPlayFile(file: PlayFile): { source: PlaySource; look: LookSource } {
  const los = file.meta.lineOfScrimmageX
  const ballY = file.meta.ballY
  const offense = file.players.filter((player) => player.team === 'offense')
  const defense = file.players.filter((player) => player.team === 'defense')
  const side = offense.length === 11 ? 'offense' : 'defense'
  const ours = side === 'offense' ? offense : defense
  const theirs = side === 'offense' ? defense : offense
  const source: PlaySource = {
    sourceVersion: 1,
    id: file.meta.id,
    name: file.meta.name,
    side,
    ...(file.meta.offenseFormation != null ? { formation: file.meta.offenseFormation } : {}),
    ...(file.meta.description != null ? { description: file.meta.description } : {}),
    ballSpot: { yardLine: los - 10, hash: yToHash(ballY) },
    duration: file.meta.duration,
    players: ours.map((player) => toSourcePlayer(player, los, ballY)),
    ball: {
      snap: file.ball.segments.some((segment) => segment.kind === 'flight' && segment.t0 <= 0)
        ? 'shotgun'
        : 'under-center',
      segments: file.ball.segments.map((segment) => ({ ...segment })),
    },
    adjustments: [],
  }
  const look: LookSource = {
    id: `${file.meta.id}-look`,
    name: file.meta.coverage ?? 'Imported look',
    side: side === 'offense' ? 'defense' : 'offense',
    ...(file.meta.defenseFront != null ? { front: file.meta.defenseFront } : {}),
    ...(file.meta.coverage != null ? { coverage: file.meta.coverage } : {}),
    players: theirs.map((player) => toLookPlayer(player, los, ballY)),
  }
  return { source, look }
}
