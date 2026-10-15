import { describe, expect, it } from 'vitest'
import { lerpAngle, smoothHeading, wrapAngle } from '../src/play/facing'

const deg = (value: number) => (value * Math.PI) / 180

describe('facing', () => {
  it('wraps to (−π, π]', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 6)
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 6)
    expect(wrapAngle(deg(190))).toBeCloseTo(deg(-170), 6)
  })

  it('lerps 170° to −170° through 180°', () => {
    expect(lerpAngle(deg(170), deg(-170), 0)).toBeCloseTo(deg(170), 5)
    expect(lerpAngle(deg(170), deg(-170), 0.5)).toBeCloseTo(Math.PI, 5)
    expect(lerpAngle(deg(170), deg(-170), 1)).toBeCloseTo(deg(-170), 5)
  })

  it('clamps the turn rate to 720°/s', () => {
    const stepped = smoothHeading(0, Math.PI, 0.01)
    const maxStep = deg(720) * 0.01
    expect(stepped).toBeCloseTo(maxStep, 5)
    expect(stepped).toBeLessThan(0.2)
  })

  it('snaps to the target on a seek', () => {
    expect(smoothHeading(0, deg(90), 1)).toBeCloseTo(deg(90), 5)
    expect(smoothHeading(0, deg(90), -0.01)).toBeCloseTo(deg(90), 5)
  })
})
