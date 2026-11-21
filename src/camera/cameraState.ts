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
  /** Player a locked viewer must watch. -1 means unlocked. Attach and detach ignore other picks. */
  lockedTo: -1,
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
  if (cameraState.lockedTo >= 0 && index !== cameraState.lockedTo) return
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
  if (cameraState.lockedTo >= 0) return
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
  if (cameraState.lockedTo >= 0 && index !== cameraState.lockedTo) return
  attachPlayer(index, nowSeconds)
  resetLook()
  cameraState.movingRef.current = true
  if (cameraState.mode !== 'pov') selectMode('pov', qbIndex, nowSeconds)
}

/** A different play cannot keep the previous roster index. */
export function notePlay(id: string, qbIndex: number): void {
  if (cameraState.playId === id) return
  cameraState.playId = id
  cameraState.lockedTo = -1
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

/**
 * Lock the viewer to one player: attach them, look through their helmet, and refuse
 * every other attach. Broadcast and Top-down stay available and follow this player.
 */
export function lockToPlayer(index: number, nowSeconds = performance.now() / 1000): void {
  if (index < 0) return
  cameraState.lockedTo = -1
  attachPlayer(index, nowSeconds)
  cameraState.lockedTo = index
  cameraState.povSubject = index
  resetLook()
  cameraState.movingRef.current = true
  if (cameraState.mode !== 'pov') selectMode('pov', index, nowSeconds)
  else emit()
}

export function unlockPlayer(): void {
  if (cameraState.lockedTo < 0) return
  cameraState.lockedTo = -1
  emit()
}
