import { yardsToWorld } from '../play/coords'
import { easeLook, lookNeedsFrame, lookState, resetLook } from './look'
import { easeOrbit, orbitState } from './orbit'

export type CamMode = 'pov' | 'broadcast' | 'topdown'

const EYE = 1.75
const EYE_FORWARD = 0.15
const LOOK_AHEAD = 10
const BROADCAST_Y = -18
const BROADCAST_HEIGHT = 14
const TOP_HEIGHT = 80
const PAD = 8

export interface RigState {
  mode: CamMode
  usingOrtho: boolean
  x: number
  y: number
  z: number
  lookX: number
  lookY: number
  lookZ: number
  fov: number
  upX: number
  upY: number
  upZ: number
  focusX: number
  focusY: number
  zoom: number
  heading: number
  /** Attached index last frame, so a hop can clear free-look. */
  povAttached: number
  initialized: boolean
  fovDirty: boolean
  moving: boolean
}

export interface RigInput {
  now: number
  dt: number
  playT: number
  prevPlayT: number
  mode: CamMode
  attached: number
  qbIndex: number
  count: number
  xy: Float32Array
  headingArr: Float32Array
  ballX: number
  ballY: number
  ballZ: number
  ballCarrier: number
  viewWidth: number
  viewHeight: number
  transitionUntil: number
}

interface Goal {
  x: number
  y: number
  z: number
  lookX: number
  lookY: number
  lookZ: number
  fov: number
  zoom: number
  upX: number
  upY: number
  upZ: number
}

const goal: Goal = {
  x: 0,
  y: 0,
  z: 0,
  lookX: 0,
  lookY: 0,
  lookZ: 0,
  fov: 40,
  zoom: 1,
  upX: 0,
  upY: 1,
  upZ: 0,
}
const camPoint = { x: 0, y: 0, z: 0 }
const lookPoint = { x: 0, y: 0, z: 0 }
const focusScratch = { x: 0, y: 0 }

export function createRigState(): RigState {
  return {
    mode: 'broadcast',
    usingOrtho: false,
    x: 0,
    y: 14,
    z: 40,
    lookX: 0,
    lookY: 0,
    lookZ: 0,
    fov: 40,
    upX: 0,
    upY: 1,
    upZ: 0,
    focusX: 35,
    focusY: 26.67,
    zoom: 1,
    heading: 0,
    povAttached: -1,
    initialized: false,
    fovDirty: true,
    moving: true,
  }
}

export function povFade(distance: number, radius: number): number {
  return distance < radius ? 0.3 : 1
}

/** Ortho zoom that fits a world span, with 8 yd of padding, inside the view. */
export function orthoZoom(
  viewWidth: number,
  viewHeight: number,
  spanX: number,
  spanZ: number,
): number {
  const needX = Math.max(spanX + PAD * 2, 1)
  const needZ = Math.max(spanZ + PAD * 2, 1)
  const width = Math.max(viewWidth, 1)
  const height = Math.max(viewHeight, 1)
  return Math.min(width / needZ, height / needX)
}

/** Vertical FOV, in degrees, that shows the same vertical span as an ortho zoom. */
export function matchedFov(viewHeight: number, zoom: number, height: number): number {
  const span = Math.max(viewHeight, 1)
  const visible = zoom <= 0 ? span : span / zoom
  const h = height <= 0.01 ? 0.01 : height
  return (2 * Math.atan(visible / 2 / h) * 180) / Math.PI
}

function damp(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target
  const k = 1 - Math.exp(-dt / tau)
  return current + (target - current) * k
}

function dampAngle(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target
  const k = 1 - Math.exp(-dt / tau)
  let delta = target - current
  const pi = Math.PI
  while (delta > pi) delta -= pi * 2
  while (delta < -pi) delta += pi * 2
  return current + delta * k
}

function read(arr: Float32Array, index: number): number {
  return arr[index] ?? 0
}

function resolveAttached(input: RigInput): number {
  if (input.mode === 'pov' && input.attached < 0) return input.qbIndex
  return input.attached
}

function fillGoal(state: RigState, input: RigInput, attached: number): void {
  let sumX = 0
  let sumY = 0
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const count = input.count
  for (let i = 0; i < count; i += 1) {
    const x = read(input.xy, i * 2)
    const y = read(input.xy, i * 2 + 1)
    sumX += x
    sumY += y
    yardsToWorld(x, y, 0, camPoint)
    if (camPoint.x < minX) minX = camPoint.x
    if (camPoint.x > maxX) maxX = camPoint.x
    if (camPoint.z < minZ) minZ = camPoint.z
    if (camPoint.z > maxZ) maxZ = camPoint.z
  }
  const cenX = count === 0 ? input.ballX : sumX / count
  const cenY = count === 0 ? input.ballY : sumY / count
  yardsToWorld(input.ballX, input.ballY, 0, camPoint)
  if (camPoint.x < minX) minX = camPoint.x
  if (camPoint.x > maxX) maxX = camPoint.x
  if (camPoint.z < minZ) minZ = camPoint.z
  if (camPoint.z > maxZ) maxZ = camPoint.z
  if (!Number.isFinite(minX)) {
    minX = 0
    maxX = 0
    minZ = 0
    maxZ = 0
  }

  if (input.mode === 'pov') {
    const index = attached >= 0 ? attached : 0
    const x = read(input.xy, index * 2)
    const y = read(input.xy, index * 2 + 1)
    const face = read(input.headingArr, index)
    const eyeX = x + Math.cos(face) * EYE_FORWARD
    const eyeY = y + Math.sin(face) * EYE_FORWARD
    const yaw = state.heading + lookState.yaw
    const pitch = lookState.pitch
    const cosP = Math.cos(pitch)
    const lookX = eyeX + Math.cos(yaw) * LOOK_AHEAD * cosP
    const lookY = eyeY + Math.sin(yaw) * LOOK_AHEAD * cosP
    const lookH = EYE + Math.sin(pitch) * LOOK_AHEAD
    yardsToWorld(eyeX, eyeY, EYE, camPoint)
    yardsToWorld(lookX, lookY, lookH, lookPoint)
    goal.x = camPoint.x
    goal.y = camPoint.y
    goal.z = camPoint.z
    goal.lookX = lookPoint.x
    goal.lookY = lookPoint.y
    goal.lookZ = lookPoint.z
    goal.fov = 75
    goal.upX = 0
    goal.upY = 1
    goal.upZ = 0
    goal.zoom = state.zoom
    return
  }

  if (input.mode === 'topdown') {
    const n = count + 1
    let accX = 0
    let accZ = 0
    for (let i = 0; i < count; i += 1) {
      yardsToWorld(read(input.xy, i * 2), read(input.xy, i * 2 + 1), 0, camPoint)
      accX += camPoint.x
      accZ += camPoint.z
    }
    yardsToWorld(input.ballX, input.ballY, 0, camPoint)
    accX += camPoint.x
    accZ += camPoint.z
    const cx = accX / n
    const cz = accZ / n
    goal.x = cx
    goal.y = TOP_HEIGHT
    goal.z = cz
    goal.lookX = cx
    goal.lookY = 0
    goal.lookZ = cz
    goal.fov = matchedFov(input.viewHeight, Math.max(state.zoom, 0.001), TOP_HEIGHT)
    goal.upX = 1
    goal.upY = 0
    goal.upZ = 0
    goal.zoom =
      orthoZoom(input.viewWidth, input.viewHeight, maxX - minX, maxZ - minZ) * orbitState.zoomMul
    return
  }

  const dist = Math.hypot(input.ballX - cenX, input.ballY - cenY)
  const inFlight = input.ballCarrier < 0
  const camX = Math.min(120, Math.max(0, state.focusX))
  yardsToWorld(camX, BROADCAST_Y, BROADCAST_HEIGHT, camPoint)
  yardsToWorld(state.focusX, state.focusY, input.ballZ * 0.7, lookPoint)
  goal.x = camPoint.x
  goal.y = camPoint.y
  goal.z = camPoint.z
  goal.lookX = lookPoint.x
  goal.lookY = lookPoint.y
  goal.lookZ = lookPoint.z
  goal.fov = inFlight && dist > 15 ? 50 : 40
  goal.upX = 0
  goal.upY = 1
  goal.upZ = 0
  goal.zoom = state.zoom
  if (orbitState.active) {
    const yaw = (orbitState.yaw * Math.PI) / 180
    const pitch = (orbitState.pitch * Math.PI) / 180
    const horiz = orbitState.distance * Math.cos(pitch)
    const height = orbitState.distance * Math.sin(pitch)
    yardsToWorld(
      state.focusX + Math.sin(yaw) * horiz,
      state.focusY - Math.cos(yaw) * horiz,
      height,
      camPoint,
    )
    goal.x = camPoint.x
    goal.y = camPoint.y
    goal.z = camPoint.z
  }
}

function rawFocus(input: RigInput, attached: number): void {
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < input.count; i += 1) {
    sumX += read(input.xy, i * 2)
    sumY += read(input.xy, i * 2 + 1)
  }
  const cenX = input.count === 0 ? input.ballX : sumX / input.count
  const cenY = input.count === 0 ? input.ballY : sumY / input.count
  const otherX = attached >= 0 ? read(input.xy, attached * 2) : cenX
  const otherY = attached >= 0 ? read(input.xy, attached * 2 + 1) : cenY
  focusScratch.x = input.ballX * 0.7 + otherX * 0.3
  focusScratch.y = input.ballY * 0.7 + otherY * 0.3
}

/** Advance the rig. No object allocation. A large seek snaps POV and glides the other modes. */
export function stepRig(state: RigState, input: RigInput): void {
  easeOrbit(input.now, input.dt)
  if (state.initialized && input.attached !== state.povAttached) resetLook()
  state.povAttached = input.attached
  easeLook(input.now, input.dt)
  const attached = resolveAttached(input)
  const playerHeading = read(input.headingArr, attached >= 0 ? attached : 0)
  const largeSeek =
    Math.abs(input.playT - input.prevPlayT) > 0.5 && input.now >= input.transitionUntil
  const inTransition = input.now < input.transitionUntil
  if (!state.initialized || largeSeek || (input.mode === 'pov' && state.mode !== 'pov')) {
    state.heading = playerHeading
  } else if (input.mode === 'pov') {
    state.heading = dampAngle(state.heading, playerHeading, 0.18, input.dt)
  }

  rawFocus(input, input.mode === 'broadcast' ? attached : -1)
  let focusTau = 0.25
  if (!state.initialized || (largeSeek && input.mode === 'pov')) focusTau = 0
  else if (largeSeek) focusTau = 0.2
  state.focusX = damp(state.focusX, focusScratch.x, focusTau, input.dt)
  state.focusY = damp(state.focusY, focusScratch.y, focusTau, input.dt)

  fillGoal(state, input, attached)

  let tau = 0.08
  if (!state.initialized) tau = 0
  else if (largeSeek && input.mode === 'pov') tau = 0
  else if (largeSeek) tau = 0.2
  else if (inTransition) tau = 0.35

  const wasOrtho = state.usingOrtho
  const useOrtho = input.mode === 'topdown' && !inTransition
  let holdFov = false
  let holdZoom = false
  if (wasOrtho && !useOrtho) {
    state.fov = matchedFov(input.viewHeight, state.zoom, TOP_HEIGHT)
    holdFov = true
  }
  if (!wasOrtho && useOrtho) {
    const half = TOP_HEIGHT * Math.tan((state.fov * Math.PI) / 360)
    const visible = half * 2
    if (visible > 0) state.zoom = input.viewHeight / visible
    holdZoom = true
  }
  state.usingOrtho = useOrtho

  const prevFov = state.fov
  const eyeErr = Math.hypot(state.x - goal.x, state.y - goal.y, state.z - goal.z)
  // A cleared offset must face forward on this frame. A hop still damps with the eye.
  const lookTau = lookState.snap && input.mode === 'pov' && eyeErr < 0.5 ? 0 : tau
  lookState.snap = false
  state.x = damp(state.x, goal.x, tau, input.dt)
  state.y = damp(state.y, goal.y, tau, input.dt)
  state.z = damp(state.z, goal.z, tau, input.dt)
  state.lookX = damp(state.lookX, goal.lookX, lookTau, input.dt)
  state.lookY = damp(state.lookY, goal.lookY, lookTau, input.dt)
  state.lookZ = damp(state.lookZ, goal.lookZ, lookTau, input.dt)
  if (!holdFov) state.fov = damp(state.fov, goal.fov, tau, input.dt)
  if (!holdZoom) state.zoom = damp(state.zoom, goal.zoom, tau <= 0 ? 0 : tau, input.dt)
  state.upX = damp(state.upX, goal.upX, tau, input.dt)
  state.upY = damp(state.upY, goal.upY, tau, input.dt)
  state.upZ = damp(state.upZ, goal.upZ, tau, input.dt)
  let len = Math.hypot(state.upX, state.upY, state.upZ)
  if (len < 1e-6) {
    state.upX = goal.upX
    state.upY = goal.upY
    state.upZ = goal.upZ
    len = 1
  }
  state.upX /= len
  state.upY /= len
  state.upZ /= len
  if (goal.upY > 0.5 && state.upY < 0) {
    state.upX *= -1
    state.upY *= -1
    state.upZ *= -1
  }

  state.fovDirty = Math.abs(state.fov - prevFov) > 0.01
  const err = Math.hypot(state.x - goal.x, state.y - goal.y, state.z - goal.z)
  state.moving =
    inTransition ||
    orbitState.active ||
    lookNeedsFrame() ||
    err > 0.05 ||
    Math.abs(state.fov - goal.fov) > 0.05
  state.mode = input.mode
  state.initialized = true
}
