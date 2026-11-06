import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  advanceClock,
  clockState,
  earliestWaypoint,
  replayClock,
  seekClock,
  spaceClock,
} from '../src/playback/clockState'
import { stepRate } from '../src/playback/rates'

beforeEach(() => {
  clockState.tRef.current = 0
  clockState.playingRef.current = false
  clockState.rateRef.current = 1
  clockState.durationRef.current = 4
  clockState.startRef.current = 0
  clockState.invalidateRef.current = () => undefined
  clockState.loopRef.current = false
})

describe('playback clock', () => {
  it('stops at duration', () => {
    clockState.playingRef.current = true
    for (let i = 0; i < 50; i += 1) advanceClock(0.1)
    expect(clockState.tRef.current).toBe(4)
    expect(clockState.playingRef.current).toBe(false)
  })

  it('clamps a hitch to 0.1 seconds', () => {
    clockState.playingRef.current = true
    advanceClock(10)
    expect(clockState.tRef.current).toBeCloseTo(0.1, 5)
  })

  it('does not move while paused', () => {
    advanceClock(1)
    expect(clockState.tRef.current).toBe(0)
  })

  it('counts wall time at the selected rate', () => {
    clockState.playingRef.current = true
    clockState.rateRef.current = 0.5
    advanceClock(0.1)
    expect(clockState.tRef.current).toBeCloseTo(0.05, 5)
    clockState.rateRef.current = 0.25
    advanceClock(0.1)
    expect(clockState.tRef.current).toBeCloseTo(0.075, 5)
  })

  it('lists quarter speed with the faster rates and stores the rate on the clock', () => {
    expect(readFileSync('src/playback/rates.ts', 'utf8')).toContain('0.25, 0.5, 1, 1.5, 2')
    const source = readFileSync('src/ui/Scrubber.tsx', 'utf8')
    expect(source).toContain('clockState.rateRef.current = value')
    expect(source).toContain('{value}×')
    expect(source).toContain('aria-pressed={value === rate}')
  })

  it('replay returns to the snap and plays', () => {
    clockState.tRef.current = 3.2
    replayClock()
    expect(clockState.tRef.current).toBe(0)
    expect(clockState.playingRef.current).toBe(true)
  })

  it('clamps a seek to the play', () => {
    seekClock(99)
    expect(clockState.tRef.current).toBe(4)
    seekClock(-2)
    expect(clockState.tRef.current).toBe(0)
  })

  it('seeks and replays from the earliest waypoint when that is before the snap', () => {
    clockState.startRef.current = -1.5
    expect(earliestWaypoint(new Float32Array([-1.5, 0, 4]))).toBe(-1.5)
    seekClock(-2)
    expect(clockState.tRef.current).toBe(-1.5)
    seekClock(1)
    expect(clockState.tRef.current).toBe(1)
    clockState.tRef.current = 4
    replayClock()
    expect(clockState.tRef.current).toBe(-1.5)
    expect(clockState.playingRef.current).toBe(true)
  })

  it('replays from the end when Space is pressed', () => {
    clockState.tRef.current = 4
    spaceClock()
    expect(clockState.tRef.current).toBe(0)
    expect(clockState.playingRef.current).toBe(true)
    spaceClock()
    expect(clockState.playingRef.current).toBe(false)
    expect(clockState.tRef.current).toBe(0)
  })
})

describe('stepRate', () => {
  it('steps to the next chip in either direction', () => {
    expect(stepRate(1, 1)).toBe(1.5)
    expect(stepRate(1, -1)).toBe(0.5)
    expect(stepRate(0.25, 1)).toBe(0.5)
    expect(stepRate(1.5, 1)).toBe(2)
  })

  it('holds at the ends', () => {
    expect(stepRate(2, 1)).toBe(2)
    expect(stepRate(0.25, -1)).toBe(0.25)
  })

  it('steps an off-list rate to the nearest chip that way and clamps outside the list', () => {
    expect(stepRate(0.75, 1)).toBe(1)
    expect(stepRate(0.75, -1)).toBe(0.5)
    expect(stepRate(3, 1)).toBe(2)
    expect(stepRate(3, -1)).toBe(2)
    expect(stepRate(0.1, -1)).toBe(0.25)
    expect(stepRate(0.1, 1)).toBe(0.25)
  })

  it('wires the bracket keys in the scrubber through stepRate', () => {
    const source = readFileSync('src/ui/Scrubber.tsx', 'utf8')
    expect(source).toContain("event.key === '['")
    expect(source).toContain("event.key === ']'")
    expect(source).toContain('stepRate(clockState.rateRef.current')
    expect(source).toContain('clockState.rateRef.current = next')
    expect(source).toContain('setRate(next)')
    expect(source).toContain('HTMLSelectElement')
    expect(source).toContain('event.ctrlKey || event.metaKey || event.altKey')
  })
})
