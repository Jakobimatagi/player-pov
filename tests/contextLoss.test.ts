import { describe, expect, it } from 'vitest'
import {
  createContextLossState,
  LOSS_WINDOW_MS,
  noteContextLost,
  noteContextLossTick,
  noteContextRestored,
  RESTORE_DEADLINE_MS,
} from '../src/gfx/contextLoss'
import { capDpr, DPR_MAX } from '../src/gfx/dpr'

describe('context loss policy', () => {
  it('marks a loss and remembers it can be restored', () => {
    const next = noteContextLost(createContextLossState(), 1_000)
    expect(next.lost).toBe(true)
    expect(next.failed).toBe(false)
    expect(next.lostAt).toBe(1_000)
  })

  it('clears the overlay on restore without failing', () => {
    const lost = noteContextLost(createContextLossState(), 1_000)
    const restored = noteContextRestored(lost)
    expect(restored.lost).toBe(false)
    expect(restored.failed).toBe(false)
    expect(restored.lossTimes).toHaveLength(1)
  })

  it('fails when restore does not arrive within 5s', () => {
    const lost = noteContextLost(createContextLossState(), 1_000)
    const still = noteContextLossTick(lost, 1_000 + RESTORE_DEADLINE_MS - 1)
    expect(still.failed).toBe(false)
    const failed = noteContextLossTick(lost, 1_000 + RESTORE_DEADLINE_MS)
    expect(failed.failed).toBe(true)
    expect(failed.lost).toBe(false)
  })

  it('fails on the third loss inside 60s', () => {
    let state = createContextLossState()
    state = noteContextLost(state, 0)
    state = noteContextRestored(state)
    state = noteContextLost(state, 10_000)
    state = noteContextRestored(state)
    state = noteContextLost(state, 20_000)
    expect(state.failed).toBe(true)
    expect(state.lost).toBe(false)
    expect(state.lossTimes).toHaveLength(3)
  })

  it('forgets losses older than 60s', () => {
    let state = createContextLossState()
    state = noteContextLost(state, 0)
    state = noteContextRestored(state)
    state = noteContextLost(state, LOSS_WINDOW_MS + 5)
    expect(state.failed).toBe(false)
    expect(state.lost).toBe(true)
    expect(state.lossTimes).toEqual([LOSS_WINDOW_MS + 5])
  })
})

describe('capDpr', () => {
  it('never exceeds 1.25, including a 2x display', () => {
    expect(DPR_MAX).toBe(1.25)
    expect(capDpr(2)).toBe(1.25)
    expect(capDpr(3)).toBe(1.25)
    expect(capDpr(1.25)).toBe(1.25)
  })

  it('floors at 1 and rejects junk', () => {
    expect(capDpr(1)).toBe(1)
    expect(capDpr(0.5)).toBe(1)
    expect(capDpr(Number.NaN)).toBe(1)
    expect(capDpr(0)).toBe(1)
  })
})
