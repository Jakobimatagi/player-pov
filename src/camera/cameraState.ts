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

const listeners = new Set<() => void>()

export function subscribeCamera(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  listeners.forEach((listener) => listener())
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
  emit()
}

/** Attach, keep the current mode, and glide the frame toward that player. */
export function attachPlayer(index: number, nowSeconds = performance.now() / 1000): void {
  if (cameraState.attached === index) return
  cameraState.attached = index
  cameraState.transitionUntil = nowSeconds + 0.6
  cameraState.movingRef.current = true
  emit()
}

export function detachPlayer(): void {
  if (cameraState.attached < 0) return
  cameraState.attached = -1
  emit()
}

/** P, or a double-click: POV on the attached player. */
export function povAttached(qbIndex: number, nowSeconds = performance.now() / 1000): void {
  if (cameraState.attached < 0) return
  if (cameraState.mode !== 'pov') selectMode('pov', qbIndex, nowSeconds)
  else {
    cameraState.transitionUntil = nowSeconds + 0.6
    cameraState.movingRef.current = true
    emit()
  }
}
