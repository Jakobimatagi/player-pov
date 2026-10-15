/**
 * Mutable playback clock. UI reads it on a throttle; the frame loop writes it.
 * Context loss and tab-hide pause through these refs so `t` is never dropped.
 */
export const clockState = {
  tRef: { current: 0 },
  playingRef: { current: false },
  /** Remembered across a context loss or a hidden tab. v1 stays paused on return. */
  wasPlayingRef: { current: false },
  rateRef: { current: 1 },
  durationRef: { current: 0 },
  /** Set by the canvas so a scrub outside the frame loop can redraw. */
  invalidateRef: { current: (): void => undefined },
}

const MAX_DT = 0.1

/** Advance play time. dt is seconds of wall clock. Stops at duration. Hidden time is not passed in. */
export function advanceClock(dt: number): void {
  if (!clockState.playingRef.current) return
  const step = Math.min(Math.max(dt, 0), MAX_DT) * clockState.rateRef.current
  let next = clockState.tRef.current + step
  if (next >= clockState.durationRef.current) {
    next = clockState.durationRef.current
    clockState.playingRef.current = false
  }
  clockState.tRef.current = next
}

export function seekClock(t: number): void {
  const duration = clockState.durationRef.current
  const clamped = Math.min(duration, Math.max(0, t))
  clockState.tRef.current = clamped
  clockState.invalidateRef.current()
}

export function replayClock(): void {
  clockState.tRef.current = 0
  clockState.playingRef.current = true
  clockState.invalidateRef.current()
}

export function pauseKeepingPlace(): void {
  clockState.wasPlayingRef.current = clockState.playingRef.current
  clockState.playingRef.current = false
}
