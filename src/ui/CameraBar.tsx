import { useEffect, useState } from 'react'
import { cameraState, selectMode } from '../camera/cameraState'
import type { CamMode } from '../camera/modes'
import type { CompiledPlay } from '../play/types'

const MODES: { mode: CamMode; label: string; short: string }[] = [
  { mode: 'pov', label: 'POV', short: 'POV' },
  { mode: 'broadcast', label: 'Broadcast', short: 'Broad' },
  { mode: 'topdown', label: 'Top-down', short: 'Top' },
]

/** Camera pills. Keys 1, 2, and 3 select POV, Broadcast, and Top-down. */
export function CameraBar({
  play,
  onFrameloop,
}: {
  play: CompiledPlay
  onFrameloop: (mode: 'always' | 'demand' | 'never') => void
}) {
  const qb = play.positions.indexOf('QB')
  const qbIndex = qb >= 0 ? qb : 0
  const [mode, setMode] = useState<CamMode>(cameraState.mode)

  const choose = (next: CamMode) => {
    selectMode(next, qbIndex)
    setMode(cameraState.mode)
    if (cameraState.movingRef.current) onFrameloop('always')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const next =
        event.key === '1'
          ? 'pov'
          : event.key === '2'
            ? 'broadcast'
            : event.key === '3'
              ? 'topdown'
              : null
      if (next == null) return
      selectMode(next, qbIndex)
      setMode(cameraState.mode)
      if (cameraState.movingRef.current) onFrameloop('always')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qbIndex, onFrameloop])

  return (
    <div className="camera-bar" data-testid="camera-bar" data-mode={mode}>
      {MODES.map((item) => (
        <button
          key={item.mode}
          type="button"
          className={mode === item.mode ? 'btn primary' : 'btn'}
          aria-label={item.label}
          data-testid={`cam-${item.mode}`}
          onClick={() => choose(item.mode)}
        >
          <span className="wide-label">{item.label}</span>
          <span className="short-label">{item.short}</span>
        </button>
      ))}
    </div>
  )
}
