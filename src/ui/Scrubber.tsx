import { useEffect, useState } from 'react'
import {
  clockState,
  pauseKeepingPlace,
  replayClock,
  seekClock,
  spaceClock,
} from '../playback/clockState'

const BASE_RATES = [0.5, 1, 1.5, 2]

export function Scrubber({
  duration,
  startT = 0,
  showQuarter,
  onFrameloop,
}: {
  duration: number
  startT?: number
  showQuarter: boolean
  onFrameloop: (mode: 'always' | 'demand' | 'never') => void
}) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const rates = showQuarter ? [0.25, ...BASE_RATES] : BASE_RATES

  useEffect(() => {
    clockState.durationRef.current = duration
    clockState.startRef.current = startT
    if (clockState.tRef.current < startT) clockState.tRef.current = startT
  }, [duration, startT])

  useEffect(() => {
    const id = window.setInterval(() => {
      setT(clockState.tRef.current)
      setPlaying(clockState.playingRef.current)
      const hidden = document.hidden
      if (hidden) onFrameloop('never')
      else if (clockState.playingRef.current) onFrameloop('always')
      else onFrameloop('demand')
    }, 100)
    return () => window.clearInterval(id)
  }, [onFrameloop])

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) pauseKeepingPlace()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (event.code === 'Space') {
        event.preventDefault()
        spaceClock()
      } else if (event.key === ',') {
        seekClock(clockState.tRef.current - 0.1)
      } else if (event.key === '.') {
        seekClock(clockState.tRef.current + 0.1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const atEnd = !playing && t >= duration - 1e-3 && duration > 0

  return (
    <div className="scrubber" data-testid="scrubber">
      <button
        type="button"
        className="btn"
        onClick={() => {
          clockState.playingRef.current = !clockState.playingRef.current
          clockState.invalidateRef.current()
        }}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min={startT}
        max={duration}
        step={0.01}
        value={t}
        aria-label="Play time"
        onChange={(event) => seekClock(Number(event.target.value))}
      />
      <span data-testid="clock-readout">
        {t.toFixed(2)} / {duration.toFixed(2)}
      </span>
      {rates.map((value) => (
        <button
          key={value}
          type="button"
          className={value === rate ? 'btn primary' : 'btn'}
          onClick={() => {
            clockState.rateRef.current = value
            setRate(value)
          }}
        >
          {value}×
        </button>
      ))}
      {atEnd && (
        <button type="button" className="btn primary" onClick={() => replayClock()}>
          Replay
        </button>
      )}
    </div>
  )
}
