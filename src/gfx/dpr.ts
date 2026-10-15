/** Hard cap from the perf budget. Ladder caps in later PRs never exceed this. */
export const DPR_MAX = 1.25

/** Clamp a device pixel ratio into the range the canvas is allowed to use. */
export function capDpr(devicePixelRatio: number, cap: number = DPR_MAX): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1
  const floor = 1
  return Math.min(Math.max(devicePixelRatio, floor), cap)
}
