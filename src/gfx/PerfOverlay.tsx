import { useEffect, useState } from 'react'
import { perfMonitor, perfStats, qualityState } from './quality'

/** `?perf=1` readout. It polls so the frame loop never calls setState. */
export function PerfOverlay() {
  const [text, setText] = useState('perf')

  useEffect(() => {
    const id = window.setInterval(() => {
      setText(
        `L${qualityState.level}  ${perfStats.calls} calls  ${perfStats.triangles} tris  p50 ${perfMonitor.p50.toFixed(1)}  p95 ${perfMonitor.p95.toFixed(1)}`,
      )
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  return (
    <p className="perf-overlay" data-testid="perf">
      {text}
    </p>
  )
}
