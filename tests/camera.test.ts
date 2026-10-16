import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  attachPlayer,
  cameraState,
  detachPlayer,
  selectMode,
  watchPlayer,
} from '../src/camera/cameraState'
import {
  LOOK_PITCH_LIMIT,
  LOOK_YAW_LIMIT,
  easeLook,
  lookState,
  nudgeLook,
  releaseLook,
  resetLook,
  setHoldLook,
} from '../src/camera/look'
import {
  createRigState,
  matchedFov,
  orthoZoom,
  povFade,
  stepRig,
  type RigInput,
} from '../src/camera/modes'
import { yardsToWorld } from '../src/play/coords'
import { clockState } from '../src/playback/clockState'

function input(patch: Partial<RigInput> = {}): RigInput {
  const xy = patch.xy ?? new Float32Array([30, 26.67])
  const headingArr = patch.headingArr ?? new Float32Array([0])
  return {
    now: 10,
    dt: 0.016,
    playT: 0,
    prevPlayT: 0,
    mode: 'broadcast',
    attached: -1,
    qbIndex: 0,
    count: 1,
    ballX: 35,
    ballY: 26.67,
    ballZ: 1.1,
    ballCarrier: 0,
    viewWidth: 800,
    viewHeight: 600,
    transitionUntil: 0,
    ...patch,
    xy,
    headingArr,
  }
}

describe('camera modes', () => {
  it('puts the POV eye 0.15 yd in front of the QB at 1.75 yd', () => {
    const state = createRigState()
    stepRig(state, input({ mode: 'pov', attached: 0 }))
    const eye = yardsToWorld(30.15, 26.67, 1.75, { x: 0, y: 0, z: 0 })
    expect(state.fov).toBeCloseTo(75, 4)
    expect(state.x).toBeCloseTo(eye.x, 4)
    expect(state.y).toBeCloseTo(eye.y, 4)
    expect(state.z).toBeCloseTo(eye.z, 4)
    expect(state.upY).toBeCloseTo(1, 4)
  })

  it('parks Broadcast on the near sideline and widens during a long throw', () => {
    const state = createRigState()
    stepRig(state, input())
    const focusX = 35 * 0.7 + 30 * 0.3
    const sideline = yardsToWorld(focusX, -18, 14, { x: 0, y: 0, z: 0 })
    expect(state.x).toBeCloseTo(sideline.x, 4)
    expect(state.y).toBeCloseTo(14, 4)
    expect(state.z).toBeCloseTo(sideline.z, 4)
    expect(state.fov).toBeCloseTo(40, 4)

    const thrown = createRigState()
    stepRig(thrown, input({ ballX: 10, ballCarrier: -1 }))
    expect(thrown.fov).toBeCloseTo(50, 4)
  })

  it('looks downfield from above in Top-down', () => {
    const state = createRigState()
    stepRig(state, input({ mode: 'topdown' }))
    expect(state.usingOrtho).toBe(true)
    expect(state.y).toBeCloseTo(80, 4)
    expect(state.upX).toBeCloseTo(1, 4)
    expect(state.upY).toBeCloseTo(0, 4)
    expect(state.upZ).toBeCloseTo(0, 4)
  })

  it('finishes a mode change 0.6 s later even if the play is scrubbed', () => {
    const state = createRigState()
    stepRig(state, input({ now: 1000, mode: 'broadcast' }))
    stepRig(
      state,
      input({
        now: 1000.3,
        dt: 0.3,
        mode: 'topdown',
        transitionUntil: 1000.6,
        playT: 0,
        prevPlayT: 2,
      }),
    )
    expect(state.usingOrtho).toBe(false)
    expect(state.mode).toBe('topdown')
    for (let i = 1; i <= 20; i += 1) {
      stepRig(
        state,
        input({
          now: 1000.3 + i * 0.015,
          dt: 0.015,
          mode: 'topdown',
          transitionUntil: 1000.6,
          playT: 0,
          prevPlayT: 0,
        }),
      )
    }
    stepRig(
      state,
      input({
        now: 1000.6,
        dt: 0.016,
        mode: 'topdown',
        transitionUntil: 1000.6,
        playT: 0,
        prevPlayT: 0,
      }),
    )
    expect(state.usingOrtho).toBe(true)
    expect(state.mode).toBe('topdown')
    expect(Number.isFinite(state.x)).toBe(true)
    expect(Number.isFinite(state.lookX)).toBe(true)
    expect(state.upY).toBeGreaterThanOrEqual(-0.01)
  })

  it('snaps POV on a large seek and keeps the ortho fit when the view gets wider', () => {
    const startXY = new Float32Array([30, 26.67])
    const nextXY = new Float32Array([50, 20])
    const live = createRigState()
    stepRig(live, input({ mode: 'pov', attached: 0, xy: startXY, playT: 2, prevPlayT: 2 }))
    const fresh = createRigState()
    stepRig(fresh, input({ mode: 'pov', attached: 0, xy: nextXY, playT: 0, prevPlayT: 0 }))
    stepRig(
      live,
      input({
        mode: 'pov',
        attached: 0,
        xy: nextXY,
        playT: 0,
        prevPlayT: 2,
        now: 40,
        transitionUntil: 0,
      }),
    )
    expect(live.x).toBeCloseTo(fresh.x, 4)
    expect(live.z).toBeCloseTo(fresh.z, 4)

    const limited = orthoZoom(800, 600, 40, 30)
    const wider = orthoZoom(1600, 600, 40, 30)
    const taller = orthoZoom(800, 1200, 40, 30)
    expect(wider).toBeCloseTo(limited, 4)
    expect(taller).toBeGreaterThan(limited)
    expect(matchedFov(800, limited, 80)).toBeGreaterThan(1)
  })

  it('aims Broadcast at the centroid when nobody is attached', () => {
    const xy = new Float32Array([30, 20, 30, 40])
    const state = createRigState()
    stepRig(
      state,
      input({
        count: 2,
        xy,
        attached: -1,
        headingArr: new Float32Array([0, 0]),
        ballX: 35,
        ballY: 26.67,
      }),
    )
    expect(state.focusX).toBeCloseTo(35 * 0.7 + 30 * 0.3, 4)
    expect(state.focusY).toBeCloseTo(26.67 * 0.7 + 30 * 0.3, 4)
  })

  it('does not store the QB on attached when entering POV', () => {
    cameraState.mode = 'broadcast'
    cameraState.attached = -1
    cameraState.povSubject = -1
    selectMode('pov', 3, 10)
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.attached).toBe(-1)
    expect(cameraState.povSubject).toBe(3)
    selectMode('broadcast', 3, 11)
    expect(cameraState.attached).toBe(-1)
    cameraState.mode = 'broadcast'
    cameraState.povSubject = -1
  })

  it('damps top-down zoom toward the resized view', () => {
    const state = createRigState()
    stepRig(state, input({ mode: 'topdown', viewWidth: 800, viewHeight: 600, dt: 0 }))
    const fitted = state.zoom
    const goal = orthoZoom(800, 1200, 0, 0)
    for (let i = 0; i < 40; i += 1) {
      stepRig(
        state,
        input({
          mode: 'topdown',
          viewWidth: 800,
          viewHeight: 1200,
          now: 20 + i * 0.05,
          dt: 0.05,
        }),
      )
    }
    expect(state.usingOrtho).toBe(true)
    expect(state.zoom).toBeGreaterThan(fitted)
    expect(Math.abs(state.zoom - goal)).toBeLessThan(Math.abs(fitted - goal))
  })

  it('aims free-look from eye height and clears it when the attached player changes', () => {
    resetLook()
    lookState.yaw = Math.PI / 2
    lookState.pitch = (20 * Math.PI) / 180
    const state = createRigState()
    stepRig(state, input({ mode: 'pov', attached: 0, dt: 0, now: 5 }))
    const eye = yardsToWorld(30.15, 26.67, 1.75, { x: 0, y: 0, z: 0 })
    const cosP = Math.cos((20 * Math.PI) / 180)
    const look = yardsToWorld(
      30.15 + Math.cos(Math.PI / 2) * 10 * cosP,
      26.67 + Math.sin(Math.PI / 2) * 10 * cosP,
      1.75 + Math.sin((20 * Math.PI) / 180) * 10,
      { x: 0, y: 0, z: 0 },
    )
    expect(state.x).toBeCloseTo(eye.x, 3)
    expect(state.y).toBeCloseTo(eye.y, 3)
    expect(state.z).toBeCloseTo(eye.z, 3)
    expect(state.lookX).toBeCloseTo(look.x, 3)
    expect(state.lookY).toBeCloseTo(look.y, 3)
    expect(state.lookZ).toBeCloseTo(look.z, 3)
    expect(state.lookY).toBeGreaterThan(state.y)

    const moved = new Float32Array([50, 26.67])
    stepRig(
      state,
      input({ mode: 'pov', attached: 0, xy: moved, now: 7, dt: 2, playT: 0, prevPlayT: 0 }),
    )
    const nextEye = yardsToWorld(50.15, 26.67, 1.75, { x: 0, y: 0, z: 0 })
    expect(state.x).toBeCloseTo(nextEye.x, 2)
    expect(state.y).toBeCloseTo(1.75, 2)
    expect(lookState.yaw).toBeCloseTo(Math.PI / 2, 4)

    stepRig(state, input({ mode: 'pov', attached: 1, xy: moved, now: 8, dt: 0.016 }))
    expect(lookState.yaw).toBe(0)
    expect(lookState.pitch).toBe(0)

    lookState.yaw = 0.3
    stepRig(state, input({ mode: 'broadcast', attached: 1, now: 9, dt: 0.016 }))
    expect(lookState.yaw).toBeCloseTo(0.3, 5)
    resetLook()
  })

  it('clamps free-look and eases back about 1 s after release unless held', () => {
    resetLook()
    nudgeLook(100000, 100000, 0)
    expect(lookState.yaw).toBeCloseTo(-LOOK_YAW_LIMIT, 5)
    expect(lookState.pitch).toBeCloseTo(-LOOK_PITCH_LIMIT, 5)
    nudgeLook(-100000, -100000, 0)
    expect(lookState.yaw).toBeCloseTo(LOOK_YAW_LIMIT, 5)
    expect(lookState.pitch).toBeCloseTo(LOOK_PITCH_LIMIT, 5)
    releaseLook(0)
    const yaw = lookState.yaw
    easeLook(0.99, 0.2)
    expect(lookState.yaw).toBeCloseTo(yaw, 5)
    easeLook(1.2, 0.3)
    expect(Math.abs(lookState.yaw)).toBeLessThan(Math.abs(yaw))

    resetLook()
    nudgeLook(-80, 0, 0)
    releaseLook(0)
    setHoldLook(true, 0.2)
    const held = lookState.yaw
    easeLook(5, 1)
    expect(lookState.yaw).toBeCloseTo(held, 5)
    setHoldLook(false, 5)
    easeLook(5.5, 0.2)
    expect(lookState.yaw).toBeCloseTo(held, 5)
    easeLook(6.3, 0.4)
    expect(Math.abs(lookState.yaw)).toBeLessThan(Math.abs(held))
    resetLook()
  })

  it('stays awake through the ease wait and does not touch the play clock', () => {
    resetLook()
    const state = createRigState()
    stepRig(state, input({ mode: 'pov', attached: 0, now: 2, dt: 0 }))
    nudgeLook(-30, 0, 2)
    releaseLook(2)
    stepRig(
      state,
      input({ mode: 'pov', attached: 0, now: 2.4, dt: 0.016, playT: 1.2, prevPlayT: 1.2 }),
    )
    expect(lookState.yaw).not.toBe(0)
    expect(state.moving).toBe(true)

    clockState.tRef.current = 1.25
    clockState.playingRef.current = true
    nudgeLook(12, -4, 3)
    expect(clockState.tRef.current).toBe(1.25)
    expect(clockState.playingRef.current).toBe(true)
    clockState.tRef.current = 0
    clockState.playingRef.current = false
    resetLook()
  })

  it('resets free-look when the attached player changes, on every Watch as pick, and on detach', () => {
    resetLook()
    cameraState.mode = 'pov'
    cameraState.attached = 0
    cameraState.watchAs = -1
    cameraState.povSubject = 0
    lookState.yaw = 0.25
    attachPlayer(0, 4)
    expect(cameraState.watchAs).toBe(0)
    expect(lookState.yaw).toBeCloseTo(0.25, 5)

    lookState.yaw = 0.2
    selectMode('broadcast', 0, 5)
    expect(cameraState.mode).toBe('broadcast')
    expect(cameraState.attached).toBe(0)
    expect(lookState.yaw).toBeCloseTo(0.2, 5)
    selectMode('pov', 0, 6)
    expect(lookState.yaw).toBeCloseTo(0.2, 5)

    watchPlayer(0, 0, 7)
    expect(cameraState.attached).toBe(0)
    expect(lookState.yaw).toBe(0)

    lookState.yaw = 0.4
    attachPlayer(1, 8)
    expect(lookState.yaw).toBe(0)
    expect(cameraState.attached).toBe(1)

    lookState.yaw = 0.4
    detachPlayer()
    expect(cameraState.attached).toBe(-1)
    expect(cameraState.watchAs).toBe(-1)
    expect(lookState.yaw).toBe(0)

    cameraState.mode = 'broadcast'
    cameraState.attached = -1
    cameraState.watchAs = -1
    cameraState.povSubject = -1
    cameraState.playId = ''
    resetLook()
    lookState.snap = false
  })

  it('zeros a held look on Escape and does not ease or restore it', () => {
    resetLook()
    setHoldLook(true, 1)
    lookState.snap = false
    const state = createRigState()
    stepRig(state, input({ mode: 'pov', attached: 0, dt: 0, now: 1 }))
    nudgeLook(200, -40, 1.2)
    releaseLook(1.2)
    for (let i = 0; i < 30; i += 1) {
      stepRig(state, input({ mode: 'pov', attached: 0, now: 1.4 + i * 0.05, dt: 0.05 }))
    }
    const turnedX = state.lookX
    const turnedZ = state.lookZ
    expect(lookState.hold).toBe(true)
    expect(Math.abs(lookState.yaw)).toBeGreaterThan(0.4)

    cameraState.mode = 'pov'
    cameraState.attached = 0
    cameraState.watchAs = 0
    detachPlayer()
    resetLook()
    expect(lookState.yaw).toBe(0)
    expect(lookState.pitch).toBe(0)
    expect(lookState.hold).toBe(true)
    expect(lookState.armed).toBe(false)
    expect(lookState.dragging).toBe(false)

    stepRig(state, input({ mode: 'pov', attached: -1, qbIndex: 0, now: 4, dt: 0.016 }))
    const ahead = yardsToWorld(40.15, 26.67, 1.75, { x: 0, y: 0, z: 0 })
    expect(state.lookX).toBeCloseTo(ahead.x, 3)
    expect(state.lookY).toBeCloseTo(ahead.y, 3)
    expect(state.lookZ).toBeCloseTo(ahead.z, 3)
    expect(Math.hypot(state.lookX - turnedX, state.lookZ - turnedZ)).toBeGreaterThan(1)
    expect(lookState.snap).toBe(false)

    easeLook(10, 1)
    easeLook(12, 1)
    stepRig(state, input({ mode: 'pov', attached: -1, qbIndex: 0, now: 12, dt: 0.5 }))
    expect(lookState.yaw).toBe(0)
    expect(lookState.pitch).toBe(0)
    expect(lookState.hold).toBe(true)
    expect(lookState.armed).toBe(false)
    expect(state.lookX).toBeCloseTo(ahead.x, 3)
    expect(state.lookZ).toBeCloseTo(ahead.z, 3)

    cameraState.mode = 'broadcast'
    cameraState.attached = -1
    cameraState.watchAs = -1
    cameraState.povSubject = -1
    cameraState.playId = ''
    setHoldLook(false, 0)
    resetLook()
    lookState.snap = false
  })

  it('does not draw a facemask overlay', () => {
    expect(existsSync('src/ui/FacemaskOverlay.tsx')).toBe(false)
    const css = readFileSync('src/index.css', 'utf8')
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(css).not.toMatch(/\.facemask/)
    expect(css).not.toMatch(/box-shadow/)
    expect(app).not.toContain('Facemask')
  })

  it('fades a box inside 0.4 yd of the POV eye', () => {
    expect(povFade(0.2, 0.4)).toBe(0.3)
    expect(povFade(0.4, 0.4)).toBe(1)
    expect(povFade(2, 0.4)).toBe(1)
  })
})
