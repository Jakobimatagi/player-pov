import { useEffect, useRef, useState } from 'react'
import {
  attachPlayer,
  cameraState,
  detachPlayer,
  povAttached,
  selectMode,
  subscribeCamera,
} from '../camera/cameraState'
import { hopInTeam, nearestOpponent } from '../camera/hop'
import { lookState, resetLook, setHoldLook } from '../camera/look'
import type { CamMode } from '../camera/modes'
import type { CompiledPlay } from '../play/types'
import { poseXY } from '../scene/framePose'
import { GyroLook } from './GyroLook'
import { WatchAs } from './WatchAs'

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
  const [watch, setWatch] = useState(cameraState.watchAs)
  const [holdLook, setHoldLookOn] = useState(lookState.hold)
  const watchOpen = useRef(false)
  const closeWatch = useRef<() => void>(() => {})

  useEffect(
    () =>
      subscribeCamera(() => {
        setMode(cameraState.mode)
        setAttached(cameraState.attached)
        setWatch(cameraState.watchAs)
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
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }
      if (watchOpen.current) {
        const inList =
          target instanceof Element && target.closest('[data-testid="watch-list"]') != null
        if (!inList && event.key === 'Escape') {
          event.preventDefault()
          closeWatch.current()
        } else if (!inList && event.key.startsWith('Arrow')) {
          event.preventDefault()
        } else if (!inList && event.key === 'Tab') {
          closeWatch.current()
        }
        return
      }
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
        if (cameraState.attached < 0) return
        event.preventDefault()
        const nextIndex =
          event.key === 'ArrowLeft' || event.key === 'ArrowRight'
            ? hopInTeam(play, cameraState.attached, event.key === 'ArrowRight' ? 1 : -1)
            : nearestOpponent(play, cameraState.attached, poseXY)
        attachPlayer(nextIndex)
        if (cameraState.movingRef.current) onFrameloop('always')
        return
      }
      if (event.key === 'Escape') {
        detachPlayer()
        resetLook()
        cameraState.movingRef.current = true
        onFrameloop('always')
      } else if (event.key === 'p' || event.key === 'P') {
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
      data-watch={watch < 0 ? '' : (play.ids[watch] ?? '')}
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
      <div className="watch-row">
        <WatchAs
          play={play}
          qbIndex={qbIndex}
          onFrameloop={onFrameloop}
          openRef={watchOpen}
          closeRef={closeWatch}
        />
        {mode === 'pov' && (
          <button
            type="button"
            className={holdLook ? 'btn primary hold-look' : 'btn hold-look'}
            aria-pressed={holdLook}
            data-testid="hold-look"
            onClick={() => {
              const next = !holdLook
              setHoldLookOn(next)
              setHoldLook(next, performance.now() / 1000)
              if (!next) {
                cameraState.movingRef.current = true
                onFrameloop('always')
              }
            }}
          >
            Hold look
          </button>
        )}
        <GyroLook onFrameloop={onFrameloop} />
      </div>
    </div>
  )
}

/** ←/→ chips beside the scrubber. Rendered only for a coarse pointer, and only while attached. */
export function HopChips({
  play,
  onFrameloop,
}: {
  play: CompiledPlay
  onFrameloop: (mode: 'always' | 'demand' | 'never') => void
}) {
  const [attached, setAttached] = useState(cameraState.attached)
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  )

  useEffect(() => subscribeCamera(() => setAttached(cameraState.attached)), [])

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)')
    const onChange = () => setCoarse(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  if (!coarse || attached < 0) return null

  const hop = (dir: 1 | -1) => {
    if (cameraState.attached < 0) return
    attachPlayer(hopInTeam(play, cameraState.attached, dir))
    if (cameraState.movingRef.current) onFrameloop('always')
  }

  return (
    <div className="hop-chips" data-testid="hop-chips">
      <button type="button" className="btn" aria-label="Hop left" onClick={() => hop(-1)}>
        ←
      </button>
      <button type="button" className="btn" aria-label="Hop right" onClick={() => hop(1)}>
        →
      </button>
    </div>
  )
}
