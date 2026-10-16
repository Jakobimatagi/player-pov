/** POV free-look, relative to the attached player's facing. Radians. No per-frame allocation. */

export const LOOK_YAW_LIMIT = (100 * Math.PI) / 180
export const LOOK_PITCH_LIMIT = (35 * Math.PI) / 180

const YAW_PER_PX = (0.45 * Math.PI) / 180
const PITCH_PER_PX = (0.4 * Math.PI) / 180
const RELEASE_DELAY = 1
const EASE_TAU = 0.4

export const lookState = {
  yaw: 0,
  pitch: 0,
  /** Keep the offset instead of easing back to forward. */
  hold: false,
  dragging: false,
  /** Set while a drag or the return-to-forward ease still needs frames. */
  armed: false,
  releasedAt: 0,
  /** Next POV step copies the look point when the eye is already there. Not an ease. */
  snap: false,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Drag right looks to the player's right. Drag up looks up. */
export function nudgeLook(dx: number, dy: number, now: number): void {
  lookState.dragging = true
  lookState.armed = true
  lookState.releasedAt = now
  lookState.yaw = clamp(lookState.yaw - dx * YAW_PER_PX, -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT)
  lookState.pitch = clamp(lookState.pitch - dy * PITCH_PER_PX, -LOOK_PITCH_LIMIT, LOOK_PITCH_LIMIT)
}

export function releaseLook(now: number): void {
  lookState.dragging = false
  lookState.releasedAt = now
  if (Math.abs(lookState.yaw) < 1e-4 && Math.abs(lookState.pitch) < 1e-4) {
    lookState.yaw = 0
    lookState.pitch = 0
    lookState.armed = false
  }
}

export function setHoldLook(hold: boolean, now: number): void {
  lookState.hold = hold
  if (hold) return
  lookState.releasedAt = now
  lookState.armed = Math.abs(lookState.yaw) > 1e-4 || Math.abs(lookState.pitch) > 1e-4
}

/** Zero the offset. Hold look is a preference and stays as it is. Does not arm an ease. */
export function resetLook(): void {
  lookState.yaw = 0
  lookState.pitch = 0
  lookState.dragging = false
  lookState.armed = false
  lookState.releasedAt = 0
  lookState.snap = true
}

/** True while a drag, the 1 s pause, or the ease still needs frames. A held offset does not. */
export function lookNeedsFrame(): boolean {
  return lookState.dragging || (lookState.armed && !lookState.hold)
}

/** After 1 s idle, yaw and pitch ease back to forward unless Hold look is on. τ 0.4 s. */
export function easeLook(now: number, dt: number): void {
  if (lookState.dragging || lookState.hold || !lookState.armed) return
  if (now - lookState.releasedAt < RELEASE_DELAY) return
  const k = 1 - Math.exp(-dt / EASE_TAU)
  lookState.yaw -= lookState.yaw * k
  lookState.pitch -= lookState.pitch * k
  if (Math.abs(lookState.yaw) < 0.002 && Math.abs(lookState.pitch) < 0.002) {
    lookState.yaw = 0
    lookState.pitch = 0
    lookState.armed = false
  }
}
