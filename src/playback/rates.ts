export const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2] as const

/** Next chip in `dir`, holding at the ends. Off-list rates step to the nearest chip that way. */
export function stepRate(rate: number, dir: -1 | 1): number {
  if (dir === 1) return PLAYBACK_RATES.find((value) => value > rate) ?? 2
  return [...PLAYBACK_RATES].reverse().find((value) => value < rate) ?? 0.25
}
