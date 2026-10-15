import type { CamMode } from './modes'

/** Shared camera selection. The rig and the player meshes read it; the buttons write it. */
export const cameraState = {
  mode: 'broadcast' as CamMode,
  /** Player index, or -1 when nobody is attached. POV with nobody attached uses the QB. */
  attached: -1,
  transitionUntil: 0,
  movingRef: { current: false },
}

export function selectMode(
  mode: CamMode,
  qbIndex: number,
  nowSeconds = performance.now() / 1000,
): void {
  if (cameraState.mode === mode) return
  if (mode === 'pov' && cameraState.attached < 0) cameraState.attached = qbIndex
  cameraState.mode = mode
  cameraState.transitionUntil = nowSeconds + 0.6
  cameraState.movingRef.current = true
}
