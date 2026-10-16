/** Broadcast orbit and pinch. Identity until a touch moves it, then it eases home after 4 s. */
export const orbitState = {
  active: false,
  yaw: 0,
  pitch: 18,
  distance: 46,
  zoomMul: 1,
  lastInput: 0,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function nudgeOrbit(dx: number, dy: number, now: number): void {
  orbitState.active = true
  orbitState.lastInput = now
  orbitState.yaw = clamp(orbitState.yaw - dx * 0.15, -60, 60)
  orbitState.pitch = clamp(orbitState.pitch - dy * 0.12, 15, 60)
}

export function nudgeBroadcastDistance(scale: number, now: number): void {
  orbitState.active = true
  orbitState.lastInput = now
  orbitState.distance = clamp(orbitState.distance * scale, 12, 60)
}

export function nudgeTopZoom(scale: number, now: number): void {
  orbitState.active = true
  orbitState.lastInput = now
  orbitState.zoomMul = clamp(orbitState.zoomMul * scale, 0.5, 2)
}

/** After 4 s idle, yaw, pitch, distance, and top-down zoom ease back. τ 0.8 s. */
export function easeOrbit(now: number, dt: number): void {
  if (!orbitState.active || now - orbitState.lastInput < 4) return
  const k = 1 - Math.exp(-dt / 0.8)
  orbitState.yaw += (0 - orbitState.yaw) * k
  orbitState.pitch += (18 - orbitState.pitch) * k
  orbitState.distance += (46 - orbitState.distance) * k
  orbitState.zoomMul += (1 - orbitState.zoomMul) * k
  if (
    Math.abs(orbitState.yaw) < 0.05 &&
    Math.abs(orbitState.pitch - 18) < 0.05 &&
    Math.abs(orbitState.distance - 46) < 0.05 &&
    Math.abs(orbitState.zoomMul - 1) < 0.01
  ) {
    orbitState.active = false
    orbitState.yaw = 0
    orbitState.pitch = 18
    orbitState.distance = 46
    orbitState.zoomMul = 1
  }
}
