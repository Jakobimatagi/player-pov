/** Pure context-loss policy (§8a.1). UI and the canvas call into this. */

export const RESTORE_DEADLINE_MS = 5_000
export const LOSS_WINDOW_MS = 60_000
export const MAX_LOSSES_IN_WINDOW = 3

export interface ContextLossState {
  /** Show the restoring overlay. */
  lost: boolean
  /** Give up and swap to the NoWebGL screen. */
  failed: boolean
  /** Timestamps of losses inside the rolling window. */
  lossTimes: number[]
  /** performance.now() when the current loss started, or null. */
  lostAt: number | null
}

export function createContextLossState(): ContextLossState {
  return { lost: false, failed: false, lossTimes: [], lostAt: null }
}

export function noteContextLost(state: ContextLossState, now: number): ContextLossState {
  if (state.failed) return state
  const lossTimes = state.lossTimes.filter((t) => now - t < LOSS_WINDOW_MS)
  lossTimes.push(now)
  if (lossTimes.length >= MAX_LOSSES_IN_WINDOW) {
    return { lost: false, failed: true, lossTimes, lostAt: null }
  }
  return { lost: true, failed: false, lossTimes, lostAt: now }
}

export function noteContextRestored(state: ContextLossState): ContextLossState {
  if (state.failed) return state
  return { ...state, lost: false, lostAt: null }
}

/** Call on a timer while lost. Fails the session if restore never arrives. */
export function noteContextLossTick(state: ContextLossState, now: number): ContextLossState {
  if (state.failed || !state.lost || state.lostAt == null) return state
  if (now - state.lostAt >= RESTORE_DEADLINE_MS) {
    return { ...state, lost: false, failed: true, lostAt: null }
  }
  return state
}
