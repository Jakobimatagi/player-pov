import { describe, expect, it } from 'vitest'
import { cameraState, selectMode } from '../src/camera/cameraState'
import {
  createRigState,
  matchedFov,
  orthoZoom,
  povFade,
  stepRig,
  type RigInput,
} from '../src/camera/modes'
import { yardsToWorld } from '../src/play/coords'

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

  it('fades a box inside 0.4 yd of the POV eye', () => {
    expect(povFade(0.2, 0.4)).toBe(0.3)
    expect(povFade(0.4, 0.4)).toBe(1)
    expect(povFade(2, 0.4)).toBe(1)
  })
})
