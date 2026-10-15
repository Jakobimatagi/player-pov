/** Heading helpers. Angles are radians. 0 faces +x, positive is counterclockwise from above. */

export const FACING_TAU = 0.12
export const MAX_TURN = (720 * Math.PI) / 180
export const SEEK_DT = 0.1

const TWO_PI = Math.PI * 2

export function wrapAngle(angle: number): number {
  let x = angle % TWO_PI
  if (x > Math.PI) x -= TWO_PI
  else if (x <= -Math.PI) x += TWO_PI
  return x
}

/** Shortest-arc blend. 170° → −170° passes through 180°. */
export function lerpAngle(from: number, to: number, u: number): number {
  return wrapAngle(from + wrapAngle(to - from) * u)
}

export function isSeek(dt: number): boolean {
  return dt < 0 || Math.abs(dt) > SEEK_DT
}

/** Critically damped step toward target. A seek snaps. Turn rate stays within 720°/s. */
export function smoothHeading(current: number, target: number, dt: number): number {
  if (isSeek(dt)) return wrapAngle(target)
  const stepScale = 1 - Math.exp(-dt / FACING_TAU)
  let step = wrapAngle(target - current) * stepScale
  const maxStep = MAX_TURN * dt
  if (step > maxStep) step = maxStep
  else if (step < -maxStep) step = -maxStep
  return wrapAngle(current + step)
}
