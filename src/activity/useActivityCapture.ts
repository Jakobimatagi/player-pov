import { useEffect, useRef } from 'react'
import { ActivitySendError, recordActivity } from '../data/activity'
import { ActivityMeter, FLUSH_MS, localDay, TICK_MS, type ViewerSample } from './meter'

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Counts a player's study on one play and sends it with record_activity every 30 seconds,
 * when the tab hides, and when the page goes away. Off when `enabled` is false (staff, demo
 * mode, drafts), so nothing is counted or sent.
 *
 * `readViewer` returns the 3D viewer's state each tick, or null on the play sheet.
 */
export function useActivityCapture(input: {
  enabled: boolean
  teamId: string | null
  playId: string | null
  readViewer: () => ViewerSample | null
}): void {
  const { enabled, teamId, playId } = input
  const readRef = useRef(input.readViewer)
  useEffect(() => {
    readRef.current = input.readViewer
  })

  useEffect(() => {
    if (!enabled || teamId == null || playId == null) return
    const meter = new ActivityMeter()
    let lastInput = performance.now()
    let sending = false

    const markInput = () => {
      lastInput = performance.now()
    }
    const tick = () => {
      meter.tick({
        now: performance.now(),
        visible: !document.hidden,
        lastInput,
        viewer: readRef.current(),
      })
    }
    const flush = () => {
      tick()
      const entries = meter.drain()
      if (entries.length === 0 || sending) {
        if (sending) meter.restore(entries)
        return
      }
      sending = true
      const day = localDay(new Date())
      Promise.allSettled(
        entries.map((entry) =>
          recordActivity({ teamId, playId, day, entry }).catch((err: unknown) => {
            // Retry a dropped connection on the next flush; a refusal is not retried.
            if (err instanceof ActivitySendError && err.retry) meter.restore([entry])
          }),
        ),
      ).finally(() => {
        sending = false
      })
    }
    const onVisibility = () => {
      if (document.hidden) flush()
      else meter.resetClock()
    }

    for (const name of INPUT_EVENTS) window.addEventListener(name, markInput, { passive: true })
    window.addEventListener('scroll', markInput, { passive: true, capture: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    const ticker = window.setInterval(tick, TICK_MS)
    const flusher = window.setInterval(flush, FLUSH_MS)
    tick()

    return () => {
      window.clearInterval(ticker)
      window.clearInterval(flusher)
      for (const name of INPUT_EVENTS) window.removeEventListener(name, markInput)
      window.removeEventListener('scroll', markInput, { capture: true })
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [enabled, teamId, playId])
}
