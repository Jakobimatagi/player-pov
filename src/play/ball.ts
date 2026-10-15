import { samplePlayer } from './sample'
import type { BallPose, CompiledBall, CompiledPlay, PlayFile, PlayerPose } from './types'

const HAND_FORWARD = 0.35
const HAND_UP = 1.1

const pose: PlayerPose = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 }
const point = { x: 0, y: 0, z: 0 }

function read(arr: ArrayLike<number>, index: number): number {
  return arr[index] ?? 0
}

/** Carrier hand in field yards, plus height. Seek-reset so compile matches a scrub. */
function hand(play: CompiledPlay, index: number, t: number): void {
  samplePlayer(play, index, t, 1, pose)
  point.x = pose.x + Math.cos(pose.heading) * HAND_FORWARD
  point.y = pose.y + Math.sin(pose.heading) * HAND_FORWARD
  point.z = HAND_UP
}

function storePoint(ball: CompiledBall, i: number, atEnd: boolean): void {
  if (atEnd) {
    ball.x1[i] = point.x
    ball.y1[i] = point.y
    ball.z1[i] = point.z
  } else {
    ball.x0[i] = point.x
    ball.y0[i] = point.y
    ball.z0[i] = point.z
  }
}

export function compileBall(file: PlayFile, play: CompiledPlay): CompiledBall {
  const segments = file.ball.segments
  const count = segments.length
  const ball: CompiledBall = {
    count,
    kind: new Uint8Array(count),
    t0: new Float64Array(count),
    t1: new Float64Array(count),
    from: new Int16Array(count),
    to: new Int16Array(count),
    apex: new Float32Array(count),
    x0: new Float32Array(count),
    y0: new Float32Array(count),
    z0: new Float32Array(count),
    x1: new Float32Array(count),
    y1: new Float32Array(count),
    z1: new Float32Array(count),
    cursor: { index: 0 },
  }
  const indexOf = new Map(play.ids.map((id, index) => [id, index]))
  segments.forEach((segment, i) => {
    ball.t0[i] = segment.t0
    ball.t1[i] = segment.t1
    if (segment.kind === 'carried') {
      ball.kind[i] = 0
      const carrier = indexOf.get(segment.carrier) ?? -1
      ball.from[i] = carrier
      ball.to[i] = -1
      if (carrier >= 0) {
        hand(play, carrier, segment.t0)
        storePoint(ball, i, false)
        hand(play, carrier, segment.t1)
        storePoint(ball, i, true)
      }
      return
    }
    ball.kind[i] = 1
    const from = indexOf.get(segment.from) ?? -1
    const to = indexOf.get(segment.to) ?? -1
    ball.from[i] = from
    ball.to[i] = to
    ball.apex[i] = segment.apex ?? 2
    if (from >= 0) {
      hand(play, from, segment.t0)
      storePoint(ball, i, false)
    }
    if (to >= 0) {
      hand(play, to, segment.t1)
      storePoint(ball, i, true)
    }
  })
  return ball
}

function hold(play: CompiledPlay, index: number, out: BallPose, atEnd: boolean): BallPose {
  const ball = play.ball
  out.x = read(atEnd ? ball.x1 : ball.x0, index)
  out.y = read(atEnd ? ball.y1 : ball.y0, index)
  out.z = read(atEnd ? ball.z1 : ball.z0, index)
  out.vx = 0
  out.vy = 0
  out.vz = 0
  out.carrierIndex = read(ball.kind, index) === 0 ? read(ball.from, index) : -1
  return out
}

/**
 * Field yards plus height. `xy`, `heading`, and `vel` are the poses just sampled
 * for the same t. Flight ends were fixed at compile, so a scrub matches a play-through.
 */
export function sampleBall(
  play: CompiledPlay,
  t: number,
  xy: Float32Array,
  heading: Float32Array,
  vel: Float32Array,
  out: BallPose,
): BallPose {
  const ball = play.ball
  const last = ball.count - 1
  if (last < 0) return out
  if (t < read(ball.t0, 0)) return hold(play, 0, out, false)
  if (t > read(ball.t1, last)) return hold(play, last, out, true)

  let index = ball.cursor.index
  if (index < 0 || index > last) index = 0
  while (index > 0 && t < read(ball.t0, index)) index -= 1
  while (index < last && t >= read(ball.t1, index)) index += 1
  ball.cursor.index = index

  const t0 = read(ball.t0, index)
  const t1 = read(ball.t1, index)
  const span = t1 - t0
  const u = span === 0 ? 0 : (t - t0) / span
  if (read(ball.kind, index) === 0) {
    const carrier = read(ball.from, index)
    const x = read(xy, carrier * 2)
    const y = read(xy, carrier * 2 + 1)
    const face = read(heading, carrier)
    out.x = x + Math.cos(face) * HAND_FORWARD
    out.y = y + Math.sin(face) * HAND_FORWARD
    out.z = HAND_UP
    out.vx = read(vel, carrier * 2)
    out.vy = read(vel, carrier * 2 + 1)
    out.vz = 0
    out.carrierIndex = carrier
    return out
  }
  const x0 = read(ball.x0, index)
  const y0 = read(ball.y0, index)
  const z0 = read(ball.z0, index)
  const x1 = read(ball.x1, index)
  const y1 = read(ball.y1, index)
  const z1 = read(ball.z1, index)
  const apex = read(ball.apex, index)
  out.x = x0 + (x1 - x0) * u
  out.y = y0 + (y1 - y0) * u
  out.z = z0 + (z1 - z0) * u + 4 * apex * u * (1 - u)
  out.vx = span === 0 ? 0 : (x1 - x0) / span
  out.vy = span === 0 ? 0 : (y1 - y0) / span
  out.vz = span === 0 ? 0 : (z1 - z0 + 4 * apex * (1 - 2 * u)) / span
  out.carrierIndex = -1
  return out
}
