import { useEffect, useState } from 'react'
import {
  attachPlayer,
  cameraState,
  detachPlayer,
  povAttached,
  selectMode,
  subscribeCamera,
} from '../camera/cameraState'
import { hopInTeam, nearestOpponent } from '../camera/hop'
import type { CamMode } from '../camera/modes'
import type { CompiledPlay } from '../play/types'
import { poseXY } from '../scene/framePose'

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
  const [attached, setAttached] = useState(cameraState.attached)

  useEffect(
    () =>
      subscribeCamera(() => {
        setMode(cameraState.mode)
        setAttached(cameraState.attached)
      }),
    [],
  )

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
      if (next != null) {
        selectMode(next, qbIndex)
        if (cameraState.movingRef.current) onFrameloop('always')
        return
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        if (cameraState.attached < 0) return
        const nextIndex =
          event.key === 'ArrowLeft' || event.key === 'ArrowRight'
            ? hopInTeam(play, cameraState.attached, event.key === 'ArrowRight' ? 1 : -1)
            : nearestOpponent(play, cameraState.attached, poseXY)
        attachPlayer(nextIndex)
        if (cameraState.movingRef.current) onFrameloop('always')
        return
      }
      if (event.key === 'Escape') detachPlayer()
      else if (event.key === 'p' || event.key === 'P') {
        povAttached(qbIndex)
        if (cameraState.movingRef.current) onFrameloop('always')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, qbIndex, onFrameloop])

  return (
    <div
      className="camera-bar"
      data-testid="camera-bar"
      data-mode={mode}
      data-attached={attached < 0 ? '' : (play.ids[attached] ?? '')}
    >
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
