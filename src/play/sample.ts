import { isSeek, lerpAngle, wrapAngle } from './facing'
import type { CompiledPlay, PlayerPose } from './types'

const SLOW = 0.4
const FACE_RELEASE = 2
const RELEASE_BLEND = 0.25
const ARRIVE_BLEND = 0.3
const TWO_PI = Math.PI * 2

const kin = new Float64Array(4)
const buf = new Float64Array(6)

function f32(arr: Float32Array, index: number): number {
  return arr[index] as number
}

function u16(arr: Uint16Array, index: number): number {
  return arr[index] as number
}

function u8(arr: Uint8Array, index: number): number {
  return arr[index] as number
}

function faceAt(arr: Float32Array, index: number): number {
  const value = arr[index]
  return value == null || Number.isNaN(value) ? Number.NaN : value
}

function kinematics(p: CompiledPlay, seg: number, t: number): void {
  const t0 = f32(p.wpT, seg)
  const t1 = f32(p.wpT, seg + 1)
  const dt = t1 - t0
  const u = dt === 0 ? 0 : (t - t0) / dt
  const x0 = f32(p.wpX, seg)
  const y0 = f32(p.wpY, seg)
  const x1 = f32(p.wpX, seg + 1)
  const y1 = f32(p.wpY, seg + 1)
  if (u8(p.wpLinear, seg) === 1 || dt === 0) {
    kin[0] = x0 + (x1 - x0) * u
    kin[1] = y0 + (y1 - y0) * u
    kin[2] = dt === 0 ? 0 : (x1 - x0) / dt
    kin[3] = dt === 0 ? 0 : (y1 - y0) / dt
    return
  }
  const u2 = u * u
  const u3 = u2 * u
  const mx0 = f32(p.tanX, seg) * dt
  const my0 = f32(p.tanY, seg) * dt
  const mx1 = f32(p.tanX, seg + 1) * dt
  const my1 = f32(p.tanY, seg + 1) * dt
  const h00 = 2 * u3 - 3 * u2 + 1
  const h10 = u3 - 2 * u2 + u
  const h01 = -2 * u3 + 3 * u2
  const h11 = u3 - u2
  kin[0] = h00 * x0 + h10 * mx0 + h01 * x1 + h11 * mx1
  kin[1] = h00 * y0 + h10 * my0 + h01 * y1 + h11 * my1
  const d00 = 6 * u2 - 6 * u
  const d10 = 3 * u2 - 4 * u + 1
  const d01 = -6 * u2 + 6 * u
  const d11 = 3 * u2 - 2 * u
  kin[2] = (d00 * x0 + d10 * mx0 + d01 * x1 + d11 * mx1) / dt
  kin[3] = (d00 * y0 + d10 * my0 + d01 * y1 + d11 * my1) / dt
}

function findSegment(p: CompiledPlay, i: number, t: number): number {
  const start = u16(p.wpStart, i)
  const last = u16(p.wpStart, i + 1) - 1
  let s = u16(p.segmentCursor, i)
  if (s < start || s >= last) s = start
  while (s > start && t < f32(p.wpT, s)) s -= 1
  while (s < last - 1 && t >= f32(p.wpT, s + 1)) s += 1
  p.segmentCursor[i] = s
  return s
}

function speedAt(p: CompiledPlay, seg: number, t: number): number {
  kinematics(p, seg, t)
  return Math.hypot(kin[2] ?? 0, kin[3] ?? 0)
}

/** First time in the segment where speed exceeds 2 yd/s. NaN if it never does. */
function firstFastTime(p: CompiledPlay, seg: number, t0: number, t1: number): number {
  const startSpeed = speedAt(p, seg, t0)
  if (startSpeed > FACE_RELEASE) return t0
  const steps = 8
  let prevT = t0
  let prevS = startSpeed
  for (let step = 1; step <= steps; step += 1) {
    const time = t0 + ((t1 - t0) * step) / steps
    const speed = speedAt(p, seg, time)
    if (speed > FACE_RELEASE) {
      const den = speed - prevS
      const u = den === 0 ? 0 : (FACE_RELEASE - prevS) / den
      const clamped = u < 0 ? 0 : u > 1 ? 1 : u
      return prevT + (time - prevT) * clamped
    }
    prevT = time
    prevS = speed
  }
  return Number.NaN
}

function hold(p: CompiledPlay, i: number, index: number, dt: number, out: Float64Array): void {
  out[0] = f32(p.wpX, index)
  out[1] = f32(p.wpY, index)
  out[2] = 0
  out[3] = 0
  out[5] = 0
  const face = faceAt(p.wpFace, index)
  let heading: number
  if (Number.isFinite(face)) heading = face
  else if (isSeek(dt)) {
    const start = u16(p.wpStart, i)
    const last = u16(p.wpStart, i + 1) - 1
    const seg = index <= start ? start : last - 1
    const boundary = index <= start ? f32(p.wpT, start) : f32(p.wpT, last)
    if (last > start && seg >= start) {
      kinematics(p, seg, boundary)
      const speed = Math.hypot(kin[2] ?? 0, kin[3] ?? 0)
      heading = speed >= SLOW ? Math.atan2(kin[3] ?? 0, kin[2] ?? 0) : f32(p.facingState, i)
    } else heading = f32(p.facingState, i)
  } else heading = f32(p.facingState, i)
  heading = wrapAngle(heading)
  p.facingState[i] = heading
  out[4] = heading
}

function sampleInto(p: CompiledPlay, i: number, t: number, dt: number, out: Float64Array): void {
  const start = u16(p.wpStart, i)
  const last = u16(p.wpStart, i + 1) - 1
  if (last <= start) {
    hold(p, i, start, dt, out)
    return
  }

  const tFirst = f32(p.wpT, start)
  const tLast = f32(p.wpT, last)
  if (t < tFirst) {
    hold(p, i, start, dt, out)
    return
  }
  if (t > tLast) {
    hold(p, i, last, dt, out)
    return
  }

  const seg = findSegment(p, i, t)
  kinematics(p, seg, t)
  const vx = kin[2] ?? 0
  const vy = kin[3] ?? 0
  out[0] = kin[0] ?? 0
  out[1] = kin[1] ?? 0
  out[2] = vx
  out[3] = vy
  const speed = Math.hypot(vx, vy)
  out[5] = speed
  const faceA = f32(p.wpFace, seg)
  const faceB = f32(p.wpFace, seg + 1)
  const hasA = Number.isFinite(faceA)
  const hasB = Number.isFinite(faceB)
  const t0 = f32(p.wpT, seg)
  const t1 = f32(p.wpT, seg + 1)
  const span = t1 - t0
  const u = span === 0 ? 0 : (t - t0) / span
  const prev = f32(p.facingState, i)
  let target = prev
  if (hasA && hasB) {
    let delta = (faceB - faceA) % TWO_PI
    if (delta > Math.PI) delta -= TWO_PI
    else if (delta <= -Math.PI) delta += TWO_PI
    target = faceA + delta * u
  } else if (hasA) {
    const cross = firstFastTime(p, seg, t0, t1)
    if (!Number.isFinite(cross) || t <= cross) target = faceA
    else {
      const blend = Math.min(1, (t - cross) / RELEASE_BLEND)
      const vel = speed >= SLOW ? Math.atan2(vy, vx) : faceA
      target = lerpAngle(faceA, vel, blend)
    }
  } else if (hasB) {
    const vel = speed >= SLOW ? Math.atan2(vy, vx) : prev
    const remain = t1 - t
    target =
      remain >= ARRIVE_BLEND ? vel : lerpAngle(vel, faceB, (ARRIVE_BLEND - remain) / ARRIVE_BLEND)
  } else if (speed >= SLOW) target = Math.atan2(vy, vx)

  let heading = target
  if (!isSeek(dt)) {
    const stepScale = 1 - Math.exp(-dt / 0.12)
    let step = (target - prev) % TWO_PI
    if (step > Math.PI) step -= TWO_PI
    else if (step <= -Math.PI) step += TWO_PI
    step *= stepScale
    const maxStep = ((720 * Math.PI) / 180) * dt
    if (step > maxStep) step = maxStep
    else if (step < -maxStep) step = -maxStep
    heading = prev + step
  }
  heading %= TWO_PI
  if (heading > Math.PI) heading -= TWO_PI
  else if (heading <= -Math.PI) heading += TWO_PI
  p.facingState[i] = heading
  out[4] = heading
}

function copyPose(out: PlayerPose): PlayerPose {
  out.x = buf[0] ?? 0
  out.y = buf[1] ?? 0
  out.vx = buf[2] ?? 0
  out.vy = buf[3] ?? 0
  out.heading = buf[4] ?? 0
  out.speed = buf[5] ?? 0
  return out
}

/** Writes the pose at t into out. dt < 0 or |dt| > 0.1 snaps heading; otherwise it smooths. */
export function samplePlayer(
  p: CompiledPlay,
  i: number,
  t: number,
  dt: number,
  out: PlayerPose,
): PlayerPose {
  sampleInto(p, i, t, dt, buf)
  return copyPose(out)
}

/** No object, array, or closure allocation. outXY is x,y pairs. outHeading is radians. */
export function samplePlayers(
  p: CompiledPlay,
  t: number,
  dt: number,
  outXY: Float32Array,
  outHeading: Float32Array,
): void {
  const n = p.count
  for (let i = 0; i < n; i += 1) {
    sampleInto(p, i, t, dt, buf)
    const o = i * 2
    outXY[o] = buf[0] as number
    outXY[o + 1] = buf[1] as number
    outHeading[i] = buf[4] as number
  }
}
