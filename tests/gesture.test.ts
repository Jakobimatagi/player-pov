import { describe, expect, it } from 'vitest'
import { createRigState, stepRig, type RigInput } from '../src/camera/modes'
import {
  easeOrbit,
  nudgeBroadcastDistance,
  nudgeOrbit,
  nudgeTopZoom,
  orbitState,
} from '../src/camera/orbit'
import { createTracker, noteDown, noteMove, noteUp } from '../src/input/gesture'
import { yardsToWorld } from '../src/play/coords'
import { boxVisual, createPickMaterial } from '../src/scene/playerVisual'

function resetOrbit(): void {
  orbitState.active = false
  orbitState.yaw = 0
  orbitState.pitch = 18
  orbitState.distance = 46
  orbitState.zoomMul = 1
  orbitState.lastInput = 0
}

function rigInput(patch: Partial<RigInput> = {}): RigInput {
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

describe('gestures', () => {
  it('treats a short pointerup as a tap', () => {
    const tr = createTracker()
    noteDown(tr, 1, 10, 20, 0, 4)
    const up = noteUp(tr, 1, 14, 22, 120, false)
    expect(up.kind).toBe('tap')
    expect(up.player).toBe(4)
  })

  it('double-taps the same player inside 300 ms', () => {
    const tr = createTracker()
    noteDown(tr, 1, 0, 0, 0, 2)
    expect(noteUp(tr, 1, 0, 0, 40, false).kind).toBe('tap')
    noteDown(tr, 1, 1, 1, 200, 2)
    const up = noteUp(tr, 1, 1, 1, 230, false)
    expect(up.kind).toBe('double-tap')
    expect(up.player).toBe(2)
  })

  it('holds a fast horizontal move for a hop and classifies it on release', () => {
    const tr = createTracker()
    noteDown(tr, 1, 0, 0, 0, 1)
    expect(noteMove(tr, 1, 80, 4, 150, 'broadcast', true).kind).toBe('ignore')
    const up = noteUp(tr, 1, 90, 5, 200, true)
    expect(up.kind).toBe('swipe-x')
    expect(up.dir).toBe(1)
    const left = createTracker()
    noteDown(left, 1, 100, 0, 0, 1)
    const back = noteUp(left, 1, 20, 2, 180, true)
    expect(back.kind).toBe('swipe-x')
    expect(back.dir).toBe(-1)
  })

  it('classifies a vertical swipe and ignores one that is not attached', () => {
    const tr = createTracker()
    noteDown(tr, 1, 0, 0, 0, 1)
    const up = noteUp(tr, 1, 3, 90, 200, true)
    expect(up.kind).toBe('swipe-y')
    const loose = createTracker()
    noteDown(loose, 1, 0, 0, 0, 1)
    expect(noteUp(loose, 1, 90, 0, 200, false).kind).toBe('ignore')
  })

  it('orbits a slow broadcast drag and ignores pinch in POV', () => {
    const tr = createTracker()
    noteDown(tr, 1, 0, 0, 0, -1)
    const drag = noteMove(tr, 1, 30, 2, 500, 'broadcast', true)
    expect(drag.kind).toBe('orbit')
    expect(drag.dx).toBeCloseTo(30, 4)

    const pinch = createTracker()
    noteDown(pinch, 1, 0, 0, 0, -1)
    noteDown(pinch, 2, 100, 0, 10, -1)
    expect(noteMove(pinch, 2, 160, 0, 40, 'pov', false).kind).toBe('ignore')
    const broadcast = createTracker()
    noteDown(broadcast, 1, 0, 0, 0, -1)
    noteDown(broadcast, 2, 100, 0, 10, -1)
    const scaled = noteMove(broadcast, 2, 150, 0, 40, 'broadcast', false)
    expect(scaled.kind).toBe('pinch')
    expect(scaled.scale).toBeCloseTo(1.5, 4)
    expect(noteUp(broadcast, 2, 150, 0, 80, true, 'broadcast').kind).toBe('ignore')
  })

  it('looks on a POV drag, still taps, and hops only on a two-finger swipe', () => {
    const look = createTracker()
    noteDown(look, 1, 0, 0, 0, 1)
    const drag = noteMove(look, 1, 90, 4, 150, 'pov', true)
    expect(drag.kind).toBe('look')
    expect(drag.dx).toBeCloseTo(90, 4)
    expect(noteUp(look, 1, 100, 5, 200, true, 'pov').kind).toBe('ignore')

    const tap = createTracker()
    noteDown(tap, 1, 10, 10, 0, 4)
    const up = noteUp(tap, 1, 12, 11, 80, false, 'pov')
    expect(up.kind).toBe('tap')
    expect(up.player).toBe(4)

    const hop = createTracker()
    noteDown(hop, 1, 0, 0, 0, 1)
    noteDown(hop, 2, 30, 0, 10, 1)
    expect(noteMove(hop, 1, 90, 2, 80, 'pov', true).kind).toBe('ignore')
    noteMove(hop, 2, 120, 2, 90, 'pov', true)
    const swiped = noteUp(hop, 2, 140, 4, 160, true, 'pov')
    expect(swiped.kind).toBe('swipe-x')
    expect(swiped.dir).toBe(1)

    const down = createTracker()
    noteDown(down, 1, 0, 0, 0, 1)
    noteDown(down, 2, 0, 20, 10, 1)
    noteMove(down, 1, 2, 100, 80, 'pov', true)
    noteMove(down, 2, 2, 120, 90, 'pov', true)
    const vertical = noteUp(down, 1, 2, 110, 150, true, 'pov')
    expect(vertical.kind).toBe('swipe-y')
    expect(vertical.dir).toBe(1)
  })
})

describe('orbit limits', () => {
  it('clamps yaw, pitch, distance, and top-down zoom', () => {
    resetOrbit()
    nudgeOrbit(1000, 1000, 5)
    expect(orbitState.yaw).toBe(-60)
    expect(orbitState.pitch).toBe(15)
    nudgeOrbit(-1000, -1000, 5)
    expect(orbitState.yaw).toBe(60)
    expect(orbitState.pitch).toBe(60)
    nudgeBroadcastDistance(0.01, 5)
    expect(orbitState.distance).toBe(12)
    nudgeBroadcastDistance(100, 5)
    expect(orbitState.distance).toBe(60)
    nudgeTopZoom(0.01, 5)
    expect(orbitState.zoomMul).toBe(0.5)
    nudgeTopZoom(100, 5)
    expect(orbitState.zoomMul).toBe(2)
    resetOrbit()
  })

  it('waits 4 s and then eases back toward the sideline', () => {
    resetOrbit()
    nudgeOrbit(20, 0, 0)
    const yaw = orbitState.yaw
    easeOrbit(3.9, 0.2)
    expect(orbitState.yaw).toBeCloseTo(yaw, 5)
    easeOrbit(4.2, 0.4)
    expect(Math.abs(orbitState.yaw)).toBeLessThan(Math.abs(yaw))
    resetOrbit()
  })

  it('places an active broadcast orbit around the focus', () => {
    resetOrbit()
    orbitState.active = true
    orbitState.lastInput = 10
    const state = createRigState()
    stepRig(state, rigInput())
    const focusX = 35 * 0.7 + 30 * 0.3
    const pitch = (18 * Math.PI) / 180
    const horiz = 46 * Math.cos(pitch)
    const height = 46 * Math.sin(pitch)
    const expected = yardsToWorld(focusX, 26.67 - horiz, height, { x: 0, y: 0, z: 0 })
    expect(state.x).toBeCloseTo(expected.x, 3)
    expect(state.y).toBeCloseTo(expected.y, 3)
    expect(state.z).toBeCloseTo(expected.z, 3)
    expect(state.moving).toBe(true)
    resetOrbit()
  })

  it('multiplies the top-down fit by the pinch zoom', () => {
    const settle = (mul: number) => {
      resetOrbit()
      orbitState.active = true
      orbitState.lastInput = 80
      orbitState.zoomMul = mul
      const state = createRigState()
      stepRig(state, rigInput({ mode: 'topdown', now: 80 }))
      stepRig(state, rigInput({ mode: 'topdown', now: 82, dt: 2 }))
      return state.zoom
    }
    expect(settle(2)).toBeCloseTo(settle(1) * 2, 3)
    resetOrbit()
  })
})

describe('pick proxy', () => {
  it('is invisible and 1.5× the body', () => {
    const material = createPickMaterial() as unknown as {
      opacity: number
      colorWrite: boolean
      depthWrite: boolean
    }
    expect(boxVisual.pickScale).toBe(1.5)
    expect(material.opacity).toBe(0)
    expect(material.colorWrite).toBe(false)
    expect(material.depthWrite).toBe(false)
    boxVisual.geometry.computeBoundingBox()
    const pick = boxVisual.geometry.clone()
    pick.scale(boxVisual.pickScale, boxVisual.pickScale, boxVisual.pickScale)
    pick.computeBoundingBox()
    const bodyBox = boxVisual.geometry.boundingBox
    const pickBox = pick.boundingBox
    expect(bodyBox).not.toBeNull()
    expect(pickBox).not.toBeNull()
    expect((pickBox?.max.y ?? 0) - (pickBox?.min.y ?? 0)).toBeCloseTo(
      ((bodyBox?.max.y ?? 0) - (bodyBox?.min.y ?? 0)) * 1.5,
      4,
    )
  })
})
