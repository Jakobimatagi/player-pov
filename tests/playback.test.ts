import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, clockState, replayClock, seekClock } from '../src/playback/clockState'

beforeEach(() => {
  clockState.tRef.current = 0
  clockState.playingRef.current = false
  clockState.rateRef.current = 1
  clockState.durationRef.current = 4
  clockState.invalidateRef.current = () => undefined
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
})
