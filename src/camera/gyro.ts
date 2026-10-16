/**
 * Phone orientation → POV free-look. The pose at enable time is forward.
 * Later samples are yaw and pitch in that frame, including screen rotation.
 * No per-event or per-frame allocation.
 */

import {
  LOOK_PITCH_LIMIT,
  LOOK_YAW_LIMIT,
  armReturnToForward,
  composeLook,
  lookState,
} from './look'

export const GYRO_PREF_KEY = 'pov.lookWithPhone'
export const GYRO_TAU = 0.14
const SILENCE_MS = 1500

export interface GyroStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const gyroState = {
  enabled: false,
  listening: false,
  blocked: false,
  seenEvent: false,
  needsBaseline: true,
  targetYaw: 0,
  targetPitch: 0,
  yaw: 0,
  pitch: 0,
  baseAlpha: 0,
  baseBeta: 0,
  baseGamma: 0,
  baseScreen: 0,
}

const offsetScratch = { yaw: 0, pitch: 0 }
const listeners = new Set<() => void>()
let storage: GyroStorage | null = null
let listenTarget: EventTarget | null = null
let silenceTimer: ReturnType<typeof setTimeout> | null = null
let wake = (): void => undefined
let readAngle = readScreenAngle

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function subscribeGyro(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setGyroWake(fn: () => void): void {
  wake = fn
}

export function setGyroScreenReader(fn: () => number): void {
  readAngle = fn
}

export function bindGyroStorage(next: GyroStorage | null): void {
  storage = next
}

export function gyroListening(): boolean {
  return gyroState.listening
}

export function gyroApiPresent(): boolean {
  return typeof DeviceOrientationEvent !== 'undefined'
}

/** iOS requires a user gesture before requestPermission. Other browsers do not. */
export function gyroNeedsGesture(): boolean {
  if (!gyroApiPresent()) return false
  const ctor = DeviceOrientationEvent as unknown as { requestPermission?: unknown }
  return typeof ctor.requestPermission === 'function'
}

export function orientationPermissionRequest(): (() => Promise<string>) | null {
  if (!gyroNeedsGesture()) return null
  const ctor = DeviceOrientationEvent as unknown as {
    requestPermission: () => Promise<string>
  }
  return () => ctor.requestPermission()
}

/** Saved on, and this load can listen without a permission prompt. */
export function gyroStartsWithoutGesture(prefOn: boolean, needsGesture: boolean): boolean {
  return prefOn && !needsGesture
}

export function readGyroPref(store: GyroStorage | null): boolean {
  if (store == null) return false
  try {
    return store.getItem(GYRO_PREF_KEY) === '1'
  } catch {
    return false
  }
}

export function writeGyroPref(store: GyroStorage | null, on: boolean): void {
  if (store == null) return
  try {
    store.setItem(GYRO_PREF_KEY, on ? '1' : '0')
  } catch {
    /* Private mode can reject the write. The in-memory toggle still works. */
  }
}

/** 0, 90, 180, or 270. `window.orientation` may be -90. */
export function normalizeScreenAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0
  const snapped = Math.round(angle / 90) * 90
  return ((snapped % 360) + 360) % 360
}

export function readScreenAngle(): number {
  const orientation = typeof screen !== 'undefined' ? screen.orientation : undefined
  if (orientation != null && typeof orientation.angle === 'number') {
    return normalizeScreenAngle(orientation.angle)
  }
  if (typeof window !== 'undefined') {
    const legacy = (window as Window & { orientation?: number }).orientation
    if (typeof legacy === 'number') return normalizeScreenAngle(legacy)
  }
  return 0
}

function screenUpDevice(angle: number): readonly [number, number, number] {
  if (angle === 90) return [1, 0, 0]
  if (angle === 180) return [0, -1, 0]
  if (angle === 270) return [-1, 0, 0]
  return [0, 1, 0]
}

/** Device vector → earth. R = Rz(-α) Rx(-β) Ry(-γ). Degrees in, no allocation. */
function deviceToEarth(
  x: number,
  y: number,
  z: number,
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  out: { x: number; y: number; z: number },
): void {
  const g = (-gammaDeg * Math.PI) / 180
  const cg = Math.cos(g)
  const sg = Math.sin(g)
  const x1 = cg * x + sg * z
  const y1 = y
  const z1 = -sg * x + cg * z
  const b = (-betaDeg * Math.PI) / 180
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  const x2 = x1
  const y2 = cb * y1 - sb * z1
  const z2 = sb * y1 + cb * z1
  const a = (-alphaDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  out.x = ca * x2 - sa * y2
  out.y = sa * x2 + ca * y2
  out.z = z2
}

const fwd = { x: 0, y: 0, z: 0 }
const up = { x: 0, y: 0, z: 0 }
const right = { x: 0, y: 0, z: 0 }
const sampleFwd = { x: 0, y: 0, z: 0 }
const baseFrame = {
  fx: 0,
  fy: 0,
  fz: 1,
  ux: 0,
  uy: 1,
  uz: 0,
  rx: 1,
  ry: 0,
  rz: 0,
}

function normalize(v: { x: number; y: number; z: number }): void {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  v.x /= len
  v.y /= len
  v.z /= len
}

function fillFrame(alpha: number, beta: number, gamma: number, screenAngle: number): void {
  deviceToEarth(0, 0, -1, alpha, beta, gamma, fwd)
  normalize(fwd)
  const su = screenUpDevice(normalizeScreenAngle(screenAngle))
  deviceToEarth(su[0], su[1], su[2], alpha, beta, gamma, up)
  const along = up.x * fwd.x + up.y * fwd.y + up.z * fwd.z
  up.x -= fwd.x * along
  up.y -= fwd.y * along
  up.z -= fwd.z * along
  normalize(up)
  right.x = fwd.y * up.z - fwd.z * up.y
  right.y = fwd.z * up.x - fwd.x * up.z
  right.z = fwd.x * up.y - fwd.y * up.x
  normalize(right)
  baseFrame.fx = fwd.x
  baseFrame.fy = fwd.y
  baseFrame.fz = fwd.z
  baseFrame.ux = up.x
  baseFrame.uy = up.y
  baseFrame.uz = up.z
  baseFrame.rx = right.x
  baseFrame.ry = right.y
  baseFrame.rz = right.z
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Yaw and pitch of `sample` relative to `base`, in radians, already clamped.
 * Portrait: lowering beta looks up. Landscape (90°): that same tilt yaws.
 * The returned object is reused. Read it before the next call.
 */
export function orientationToOffset(
  alpha: number,
  beta: number,
  gamma: number,
  baseAlpha: number,
  baseBeta: number,
  baseGamma: number,
  baseScreen: number,
): { yaw: number; pitch: number } {
  fillFrame(baseAlpha, baseBeta, baseGamma, baseScreen)
  deviceToEarth(0, 0, -1, alpha, beta, gamma, sampleFwd)
  normalize(sampleFwd)
  const dotF = sampleFwd.x * baseFrame.fx + sampleFwd.y * baseFrame.fy + sampleFwd.z * baseFrame.fz
  const dotR = sampleFwd.x * baseFrame.rx + sampleFwd.y * baseFrame.ry + sampleFwd.z * baseFrame.rz
  const dotU = sampleFwd.x * baseFrame.ux + sampleFwd.y * baseFrame.uy + sampleFwd.z * baseFrame.uz
  const yaw = -Math.atan2(dotR, dotF)
  const pitch = Math.atan2(dotU, Math.hypot(dotF, dotR))
  offsetScratch.yaw = clamp(yaw, -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT)
  offsetScratch.pitch = clamp(pitch, -LOOK_PITCH_LIMIT, LOOK_PITCH_LIMIT)
  return offsetScratch
}

function captureBase(alpha: number, beta: number, gamma: number, screenAngle: number): void {
  gyroState.baseAlpha = alpha
  gyroState.baseBeta = beta
  gyroState.baseGamma = gamma
  gyroState.baseScreen = normalizeScreenAngle(screenAngle)
  gyroState.needsBaseline = false
  lookState.rebaselineGyro = false
  gyroState.targetYaw = 0
  gyroState.targetPitch = 0
  gyroState.yaw = 0
  gyroState.pitch = 0
  lookState.gyroSettling = false
  composeLook(0, 0)
}

function consumeRebaseline(): void {
  if (!lookState.rebaselineGyro) return
  gyroState.needsBaseline = true
  gyroState.targetYaw = 0
  gyroState.targetPitch = 0
  gyroState.yaw = 0
  gyroState.pitch = 0
  lookState.gyroYaw = 0
  lookState.gyroPitch = 0
  lookState.gyroSettling = false
  lookState.rebaselineGyro = false
}

function onDeviceOrientation(event: Event): void {
  if (!gyroState.listening) return
  const sample = event as Event & {
    alpha?: number | null
    beta?: number | null
    gamma?: number | null
  }
  if (sample.alpha == null || sample.beta == null || sample.gamma == null) return
  gyroState.seenEvent = true
  if (silenceTimer != null) {
    clearTimeout(silenceTimer)
    silenceTimer = null
  }
  consumeRebaseline()
  const screenAngle = readAngle()
  if (gyroState.needsBaseline || screenAngle !== gyroState.baseScreen) {
    captureBase(sample.alpha, sample.beta, sample.gamma, screenAngle)
    wake()
    return
  }
  const offset = orientationToOffset(
    sample.alpha,
    sample.beta,
    sample.gamma,
    gyroState.baseAlpha,
    gyroState.baseBeta,
    gyroState.baseGamma,
    gyroState.baseScreen,
  )
  gyroState.targetYaw = offset.yaw
  gyroState.targetPitch = offset.pitch
  lookState.gyroSettling = true
  lookState.armed = true
  wake()
}

function detach(): void {
  if (silenceTimer != null) {
    clearTimeout(silenceTimer)
    silenceTimer = null
  }
  if (listenTarget != null) {
    listenTarget.removeEventListener('deviceorientation', onDeviceOrientation)
  }
  listenTarget = null
  gyroState.listening = false
}

function armSilenceTimer(): void {
  if (silenceTimer != null) clearTimeout(silenceTimer)
  silenceTimer = setTimeout(() => {
    silenceTimer = null
    if (!gyroState.seenEvent) quietFail()
  }, SILENCE_MS)
}

function quietFail(): void {
  detach()
  gyroState.enabled = false
  gyroState.blocked = true
  lookState.gyroOn = false
  lookState.gyroSettling = false
  writeGyroPref(storage, false)
  emit()
}

export function startGyro(target: EventTarget): void {
  if (gyroState.listening && listenTarget === target) {
    gyroState.enabled = true
    gyroState.blocked = false
    lookState.gyroOn = true
    lookState.gyroEase = false
    writeGyroPref(storage, true)
    emit()
    return
  }
  detach()
  gyroState.enabled = true
  gyroState.blocked = false
  gyroState.seenEvent = false
  gyroState.needsBaseline = true
  gyroState.targetYaw = 0
  gyroState.targetPitch = 0
  gyroState.yaw = 0
  gyroState.pitch = 0
  lookState.gyroOn = true
  lookState.gyroEase = false
  lookState.gyroSettling = false
  lookState.dragYaw = 0
  lookState.dragPitch = 0
  lookState.yaw = 0
  lookState.pitch = 0
  lookState.gyroYaw = 0
  lookState.gyroPitch = 0
  lookState.snap = true
  lookState.armed = false
  listenTarget = target
  gyroState.listening = true
  target.addEventListener('deviceorientation', onDeviceOrientation)
  armSilenceTimer()
  writeGyroPref(storage, true)
  emit()
  wake()
}

/** Remove the listener immediately and ease the view back to forward. */
export function disableGyro(now: number): void {
  detach()
  gyroState.enabled = false
  gyroState.targetYaw = 0
  gyroState.targetPitch = 0
  gyroState.yaw = 0
  gyroState.pitch = 0
  lookState.gyroOn = false
  lookState.gyroSettling = false
  lookState.gyroYaw = 0
  lookState.gyroPitch = 0
  lookState.dragYaw = 0
  lookState.dragPitch = 0
  armReturnToForward(now)
  writeGyroPref(storage, false)
  emit()
  wake()
}

/**
 * Apply a saved On only when this browser can listen without a gesture.
 * Never calls requestPermission.
 */
export function restoreGyroPref(
  store: GyroStorage | null,
  needsGesture: boolean,
  target: EventTarget,
): boolean {
  bindGyroStorage(store)
  if (!gyroStartsWithoutGesture(readGyroPref(store), needsGesture)) return false
  startGyro(target)
  return true
}

export type GyroGestureResult = 'on' | 'denied' | 'failed'

/** Call from the toggle's tap. `request()` runs before any await. */
export function enableGyroFromGesture(
  request: (() => Promise<string>) | null,
  target: EventTarget,
): Promise<GyroGestureResult> {
  if (request == null) {
    startGyro(target)
    return Promise.resolve('on')
  }
  let pending: Promise<string>
  try {
    pending = request()
  } catch {
    quietFail()
    return Promise.resolve('failed')
  }
  return pending.then(
    (result) => {
      if (result !== 'granted') {
        quietFail()
        return 'denied'
      }
      startGyro(target)
      return 'on'
    },
    () => {
      quietFail()
      return 'failed'
    },
  )
}

/** Ease the phone offset toward the latest sample. No allocation. */
export function stepGyro(dt: number): void {
  consumeRebaseline()
  if (!gyroState.enabled) return
  const k = dt <= 0 ? 1 : 1 - Math.exp(-dt / GYRO_TAU)
  gyroState.yaw += (gyroState.targetYaw - gyroState.yaw) * k
  gyroState.pitch += (gyroState.targetPitch - gyroState.pitch) * k
  if (Math.abs(gyroState.targetYaw - gyroState.yaw) < 0.0005) gyroState.yaw = gyroState.targetYaw
  if (Math.abs(gyroState.targetPitch - gyroState.pitch) < 0.0005) {
    gyroState.pitch = gyroState.targetPitch
  }
  composeLook(gyroState.yaw, gyroState.pitch)
  lookState.gyroSettling =
    gyroState.yaw !== gyroState.targetYaw || gyroState.pitch !== gyroState.targetPitch
}

export function resetGyroForTests(): void {
  detach()
  gyroState.enabled = false
  gyroState.blocked = false
  gyroState.seenEvent = false
  gyroState.needsBaseline = true
  gyroState.targetYaw = 0
  gyroState.targetPitch = 0
  gyroState.yaw = 0
  gyroState.pitch = 0
  lookState.gyroOn = false
  lookState.gyroSettling = false
  lookState.gyroEase = false
  lookState.rebaselineGyro = false
  lookState.dragYaw = 0
  lookState.dragPitch = 0
  lookState.gyroYaw = 0
  lookState.gyroPitch = 0
  storage = null
  readAngle = readScreenAngle
  wake = () => undefined
}
