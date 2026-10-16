import { afterEach, describe, expect, it } from 'vitest'
import {
  LOOK_PITCH_LIMIT,
  LOOK_YAW_LIMIT,
  easeLook,
  lookState,
  nudgeLook,
  resetLook,
} from '../src/camera/look'
import {
  GYRO_PREF_KEY,
  disableGyro,
  enableGyroFromGesture,
  gyroStartsWithoutGesture,
  gyroState,
  normalizeScreenAngle,
  orientationToOffset,
  readGyroPref,
  resetGyroForTests,
  restoreGyroPref,
  startGyro,
  stepGyro,
  writeGyroPref,
  type GyroStorage,
} from '../src/camera/gyro'

class OrientationEvent extends Event {
  alpha: number | null
  beta: number | null
  gamma: number | null

  constructor(alpha: number | null, beta: number | null, gamma: number | null) {
    super('deviceorientation')
    this.alpha = alpha
    this.beta = beta
    this.gamma = gamma
  }
}

function memoryStorage(): GyroStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

function arm(target = new EventTarget()): EventTarget {
  startGyro(target)
  return target
}

afterEach(() => {
  resetGyroForTests()
  resetLook()
  lookState.hold = false
  lookState.snap = false
})

describe('orientation to look offset', () => {
  it('is zero at the enable pose', () => {
    const offset = orientationToOffset(20, 70, -5, 20, 70, -5, 0)
    expect(offset.yaw).toBeCloseTo(0, 6)
    expect(offset.pitch).toBeCloseTo(0, 6)
  })

  it('clamps yaw and pitch to the free-look limits', () => {
    const pitch = orientationToOffset(0, -10, 0, 0, 70, 0, 0)
    expect(pitch.pitch).toBeCloseTo(LOOK_PITCH_LIMIT, 5)
    expect(Math.abs(pitch.yaw)).toBeLessThan(0.2)
    const yaw = orientationToOffset(160, 70, 0, 0, 70, 0, 0)
    expect(Math.abs(yaw.yaw)).toBeCloseTo(LOOK_YAW_LIMIT, 5)
  })

  it('swaps the tilt axis when the screen is landscape', () => {
    const portrait = orientationToOffset(0, 70, 20, 0, 70, 0, 0)
    const portraitYaw = portrait.yaw
    const portraitPitch = portrait.pitch
    expect(portraitYaw).toBeCloseTo((-20 * Math.PI) / 180, 4)
    expect(portraitPitch).toBeCloseTo(0, 4)

    const landscape = orientationToOffset(0, 70, 20, 0, 70, 0, 90)
    expect(landscape.yaw).toBeCloseTo(0, 4)
    expect(landscape.pitch).toBeCloseTo((20 * Math.PI) / 180, 4)
    expect(normalizeScreenAngle(-90)).toBe(270)
    expect(normalizeScreenAngle(90)).toBe(90)
  })

  it('adds a finger drag on top of the phone offset', () => {
    const target = arm()
    target.dispatchEvent(new OrientationEvent(0, 70, 0))
    target.dispatchEvent(new OrientationEvent(0, 50, 0))
    stepGyro(2)
    expect(lookState.pitch).toBeCloseTo((20 * Math.PI) / 180, 3)
    expect(lookState.yaw).toBeCloseTo(0, 3)
    nudgeLook(-80, 0, 1)
    const drag = (80 * 0.45 * Math.PI) / 180
    expect(lookState.yaw).toBeCloseTo(drag, 4)
    expect(lookState.pitch).toBeCloseTo((20 * Math.PI) / 180, 3)
    expect(Math.abs(lookState.yaw)).toBeLessThanOrEqual(LOOK_YAW_LIMIT + 1e-6)
    nudgeLook(-100000, 0, 1)
    expect(lookState.yaw).toBeCloseTo(LOOK_YAW_LIMIT, 5)
  })

  it('recenters by re-baselining the phone pose', () => {
    const target = arm()
    target.dispatchEvent(new OrientationEvent(0, 70, 0))
    target.dispatchEvent(new OrientationEvent(0, 50, 0))
    stepGyro(2)
    expect(lookState.pitch).toBeGreaterThan(0.2)
    resetLook()
    target.dispatchEvent(new OrientationEvent(0, 50, 0))
    stepGyro(2)
    expect(lookState.yaw).toBeCloseTo(0, 5)
    expect(lookState.pitch).toBeCloseTo(0, 5)
    target.dispatchEvent(new OrientationEvent(0, 50, 0))
    stepGyro(2)
    expect(lookState.pitch).toBeCloseTo(0, 5)
  })
})

describe('look with phone preference and listener', () => {
  it('removes the deviceorientation listener as soon as the toggle turns off', () => {
    let removed = 0
    const target = new EventTarget()
    const origRemove = target.removeEventListener.bind(target)
    target.removeEventListener = (type, listener, options) => {
      if (type === 'deviceorientation') removed += 1
      origRemove(type, listener, options)
    }
    startGyro(target)
    target.dispatchEvent(new OrientationEvent(0, 70, 0))
    target.dispatchEvent(new OrientationEvent(0, 50, 0))
    stepGyro(2)
    const pitch = lookState.pitch
    expect(pitch).toBeGreaterThan(0.2)
    expect(gyroState.listening).toBe(true)

    disableGyro(4)
    expect(removed).toBe(1)
    expect(gyroState.listening).toBe(false)
    target.dispatchEvent(new OrientationEvent(0, 10, 40))
    stepGyro(2)
    expect(lookState.pitch).toBeCloseTo(pitch, 5)
    easeLook(4, 0.45)
    expect(Math.abs(lookState.pitch)).toBeLessThan(Math.abs(pitch))
    expect(lookState.gyroEase).toBe(true)
  })

  it('remembers the choice and does not prompt when restoring', () => {
    const store = memoryStorage()
    expect(readGyroPref(store)).toBe(false)
    expect(store.getItem(GYRO_PREF_KEY)).toBeNull()
    writeGyroPref(store, true)
    expect(readGyroPref(store)).toBe(true)
    expect(gyroStartsWithoutGesture(true, false)).toBe(true)
    expect(gyroStartsWithoutGesture(true, true)).toBe(false)
    expect(gyroStartsWithoutGesture(false, false)).toBe(false)

    const asking = new EventTarget()
    let asked = 0
    const request = () => {
      asked += 1
      return Promise.resolve('granted')
    }
    expect(restoreGyroPref(store, true, asking)).toBe(false)
    expect(asked).toBe(0)
    expect(gyroState.listening).toBe(false)
    expect(readGyroPref(store)).toBe(true)
    void request

    const target = new EventTarget()
    expect(restoreGyroPref(store, false, target)).toBe(true)
    expect(gyroState.listening).toBe(true)
    disableGyro(2)
    expect(gyroState.listening).toBe(false)
    expect(readGyroPref(store)).toBe(false)

    resetGyroForTests()
    expect(readGyroPref(store)).toBe(false)
    expect(restoreGyroPref(store, false, new EventTarget())).toBe(false)
    expect(gyroState.listening).toBe(false)
  })

  it('hides a denied permission without throwing', async () => {
    const target = new EventTarget()
    const denied = await enableGyroFromGesture(() => Promise.resolve('denied'), target)
    expect(denied).toBe('denied')
    expect(gyroState.listening).toBe(false)
    expect(gyroState.blocked).toBe(true)
    expect(gyroState.enabled).toBe(false)

    resetGyroForTests()
    const thrown = await enableGyroFromGesture(() => {
      throw new Error('blocked')
    }, target)
    expect(thrown).toBe('failed')
    expect(gyroState.blocked).toBe(true)
    expect(gyroState.listening).toBe(false)
  })
})
