import type { CamMode } from './modes'

/** Shared camera selection. The rig and the player meshes read it; the buttons write it. */
export const cameraState = {
  mode: 'broadcast' as CamMode,
  /** Explicit attach. -1 means nobody. Broadcast uses this, never an implicit QB. */
  attached: -1,
  /** Who POV looks through when `attached` is -1. Broadcast does not read it. */
  povSubject: -1,
  transitionUntil: 0,
  movingRef: { current: false },
}

export function selectMode(
  mode: CamMode,
  qbIndex: number,
  nowSeconds = performance.now() / 1000,
): void {
  if (cameraState.mode === mode) return
  cameraState.mode = mode
  if (mode === 'pov') {
    cameraState.povSubject = cameraState.attached >= 0 ? cameraState.attached : qbIndex
  }
  cameraState.transitionUntil = nowSeconds + 0.6
  cameraState.movingRef.current = true
}
