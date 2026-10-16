import { resetLook } from './look'
import type { CamMode } from './modes'

/** Shared camera selection. The rig and the player meshes read it; the buttons write it. */
export const cameraState = {
  mode: 'broadcast' as CamMode,
  /** Explicit attach. -1 means nobody. Broadcast uses this, never an implicit QB. */
  attached: -1,
  /** Who POV looks through when `attached` is -1. Broadcast does not read it. */
  povSubject: -1,
  /** Player shown in Watch as. -1 is the empty control. */
  watchAs: -1,
  /** Play id Watch as last bound to. A change drops the old attach. */
  playId: '',
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
  const previous = cameraState.mode
  cameraState.mode = mode
  if (mode === 'pov') {
    cameraState.povSubject = cameraState.attached >= 0 ? cameraState.attached : qbIndex
    if (cameraState.attached >= 0) cameraState.watchAs = cameraState.attached
  } else if (previous === 'pov') {
    cameraState.watchAs = -1
  }
  cameraState.transitionUntil = nowSeconds + 0.6
  cameraState.movingRef.current = true
  emit()
}

/** Attach, keep the current mode, and glide the frame toward that player. */
export function attachPlayer(index: number, nowSeconds = performance.now() / 1000): void {
  const same = cameraState.attached === index
  if (same && cameraState.watchAs === index) return
  cameraState.attached = index
  cameraState.watchAs = index
  if (!same) {
    cameraState.transitionUntil = nowSeconds + 0.6
    cameraState.movingRef.current = true
    resetLook()
  }
  emit()
}

export function detachPlayer(): void {
  if (cameraState.attached < 0 && cameraState.watchAs < 0) return
  const changed = cameraState.attached >= 0
  cameraState.attached = -1
  cameraState.watchAs = -1
  if (changed) resetLook()
  emit()
}

/** Pick from Watch as: attach that player, look through them, and drop any free-look. */
export function watchPlayer(
  index: number,
  qbIndex: number,
  nowSeconds = performance.now() / 1000,
): void {
  attachPlayer(index, nowSeconds)
  resetLook()
  cameraState.movingRef.current = true
  if (cameraState.mode !== 'pov') selectMode('pov', qbIndex, nowSeconds)
}

/** A different play cannot keep the previous roster index. */
export function notePlay(id: string, qbIndex: number): void {
  if (cameraState.playId === id) return
  cameraState.playId = id
  cameraState.povSubject = qbIndex
  detachPlayer()
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
