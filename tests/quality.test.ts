import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  QUALITY_LADDER,
  beginWarmup,
  createSampler,
  hasFeature,
  noteFrame,
  noteRecovered,
  showNumber,
  type QualitySampler,
} from '../src/gfx/quality'

function warmed(level: 0 | 1 | 2 | 3 = 0): QualitySampler {
  const state = createSampler(0, level)
  state.warmupUntil = 0
  return state
}

function feed(state: QualitySampler, frameMs: number, start: number, count: number): number {
  let level = state.level
  let changes = 0
  for (let i = 0; i < count; i += 1) {
    const next = noteFrame(state, frameMs, start + i * frameMs)
    if (next !== level) {
      changes += 1
      level = next
    }
  }
  return changes
}

describe('quality ladder', () => {
  it('drops only resolution, then distant numbers, then routes and camera rate', () => {
    expect(QUALITY_LADDER.map((tier) => tier.dpr)).toEqual([1.25, 1, 0.85, 0.75])
    expect(hasFeature(0, 'routes')).toBe(true)
    expect(hasFeature(2, 'distantNumbers')).toBe(false)
    expect(hasFeature(2, 'routes')).toBe(true)
    expect(hasFeature(3, 'routes')).toBe(false)
    expect(hasFeature(3, 'smoothCamera')).toBe(false)
    expect(hasFeature(3, 'numbers')).toBe(true)
    expect(showNumber(2, 0, 1, 16)).toBe(false)
    expect(showNumber(2, 0, 0, 40)).toBe(true)
    expect(showNumber(2, 0, 3, 10)).toBe(true)
    expect(showNumber(2, -1, 3, 40)).toBe(true)
  })

  it('steps down once when the 90-frame p90 is 21 ms', () => {
    const state = warmed(0)
    expect(feed(state, 21, 10_000, 90)).toBe(1)
    expect(state.level).toBe(1)
  })

  it('steps down immediately on 3 frames above 50 ms within 1 s', () => {
    const state = warmed(0)
    expect(noteFrame(state, 60, 10_000)).toBe(0)
    expect(noteFrame(state, 60, 10_200)).toBe(0)
    expect(noteFrame(state, 60, 10_400)).toBe(1)
  })

  it('steps up once on 5 s of 16.7 ms frames and refuses a 5% 18 ms mix', () => {
    const steady = warmed(1)
    expect(feed(steady, 16.7, 20_000, 300)).toBe(1)
    expect(steady.level).toBe(0)

    const mixed = warmed(1)
    let level = mixed.level
    let changes = 0
    for (let i = 0; i < 300; i += 1) {
      const frame = i % 20 === 0 ? 18 : 16.7
      const next = noteFrame(mixed, frame, 30_000 + i * 16.7)
      if (next !== level) {
        changes += 1
        level = next
      }
    }
    expect(changes).toBe(0)
    expect(mixed.level).toBe(1)
  })

  it('holds the cooldown for 2 s', () => {
    const state = warmed(0)
    feed(state, 21, 40_000, 90)
    expect(state.level).toBe(1)
    const during = state.cooldownUntil - 1900
    feed(state, 21, during, 90)
    expect(state.level).toBe(1)
    feed(state, 21, state.cooldownUntil, 90)
    expect(state.level).toBe(2)
  })

  it('locks a level after three up-and-down flaps inside 60 s', () => {
    const state = warmed(1)
    let now = 50_000
    for (let cycle = 0; cycle < 3; cycle += 1) {
      feed(state, 16.7, now, 300)
      expect(state.level).toBe(0)
      now = state.cooldownUntil
      feed(state, 21, now, 90)
      expect(state.level).toBe(1)
      now = state.cooldownUntil
    }
    expect(state.locked.has(0)).toBe(true)
    feed(state, 16.7, now, 300)
    expect(state.level).toBe(1)
  })

  it('ignores a frame longer than 250 ms', () => {
    const state = warmed(0)
    feed(state, 21, 80_000, 40)
    noteFrame(state, 400, 80_000 + 40 * 21)
    expect(feed(state, 21, 81_000, 50)).toBe(1)
    expect(state.level).toBe(1)
  })

  it('keeps L2 across a context restore and warms up', () => {
    const state = warmed(2)
    noteRecovered(state, 90_000)
    expect(state.level).toBe(2)
    expect(state.warmupUntil).toBe(92_000)
    noteFrame(state, 21, 90_100)
    expect(state.level).toBe(2)
  })

  it('ignores the warm-up window', () => {
    const state = createSampler(0, 0)
    beginWarmup(state, 1000)
    feed(state, 21, 1000, 90)
    expect(state.level).toBe(0)
    expect(feed(state, 21, state.warmupUntil, 90)).toBe(1)
  })
})

describe('quality persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reloads the stored level', () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    })
    const state = warmed(0)
    feed(state, 21, 100_000, 90)
    expect(memory.get('pov.quality')).toBe('1')
  })
})
