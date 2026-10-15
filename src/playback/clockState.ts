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
}

export function pauseKeepingPlace(): void {
  clockState.wasPlayingRef.current = clockState.playingRef.current
  clockState.playingRef.current = false
}
