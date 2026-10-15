import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createContextLossState,
  noteContextLost,
  noteContextLossTick,
  noteContextRestored,
  type ContextLossState,
} from './gfx/contextLoss'
import { PerfOverlay } from './gfx/PerfOverlay'
import {
  beginWarmup,
  noteRecovered,
  perfMonitor,
  QUALITY_LADDER,
  qualityState,
} from './gfx/quality'
import { useCappedDpr } from './gfx/useCappedDpr'
import { registerContextRestore, runContextRestore } from './gfx/useContextRestore'
import { detectWebGL } from './gfx/webglSupport'
import { clockState, earliestWaypoint, pauseKeepingPlace } from './playback/clockState'
import { useClock } from './playback/useClock'
import { playUrlFromSearch } from './play/load'
import { usePlay } from './play/usePlay'
import { fieldConfigFromSearch } from './field/fieldConfig'
import { CameraRig } from './scene/CameraRig'
import { Field } from './scene/Field'
import { GestureInput } from './scene/GestureInput'
import { Players } from './scene/Players'
import { RouteLines } from './scene/RouteLines'
import { CameraBar, HopChips } from './ui/CameraBar'
import { FacemaskOverlay } from './ui/FacemaskOverlay'
import { cameraState, subscribeCamera } from './camera/cameraState'
import { Scrubber } from './ui/Scrubber'
import { ContextLossOverlay } from './ui/ContextLossOverlay'
import { LoadError } from './ui/LoadError'
import { NoWebGL } from './ui/NoWebGL'

function exposeDevClock(): void {
  if (!import.meta.env.DEV) return
  window.__pov = {
    tRef: clockState.tRef,
    playingRef: clockState.playingRef,
  }
}

/** Publishes the renderer's drawing buffer size and binds context-loss events. */
function RendererProbe({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((s) => s.gl)
  const dpr = useThree((s) => s.viewport.dpr)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const canvas = gl.domElement
    const publish = () => {
      canvas.dataset['dpr'] = String(dpr)
      canvas.dataset['drawingBufferWidth'] = String(canvas.width)
      canvas.dataset['drawingBufferHeight'] = String(canvas.height)
    }
    publish()
    gl.shadowMap.enabled = false
    const unregister = registerContextRestore(publish)

    const handleLost = (event: Event) => {
      event.preventDefault()
      onLost()
    }
    canvas.addEventListener('webglcontextlost', handleLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      unregister()
      canvas.removeEventListener('webglcontextlost', handleLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl, dpr, size, onLost, onRestored])

  return null
}

function ClockMount() {
  useClock()
  return null
}

export function App() {
  const loaded = usePlay(playUrlFromSearch(window.location.search))
  const [webglOk] = useState(detectWebGL)
  const forceFlat = new URLSearchParams(window.location.search).get('webgl') === '0'
  const [loss, setLoss] = useState<ContextLossState>(createContextLossState)
  const [heldT, setHeldT] = useState(0)
  const lossRef = useRef(loss)
  const perfMode = new URLSearchParams(window.location.search).get('perf') === '1'
  const [qualityLevel, setQualityLevel] = useState(qualityState.level)
  const [camMode, setCamMode] = useState(cameraState.mode)
  const [attached, setAttached] = useState(cameraState.attached)
  const dpr = useCappedDpr(QUALITY_LADDER[qualityLevel]?.dpr ?? 1.25)

  const commitLoss = useCallback((next: ContextLossState) => {
    lossRef.current = next
    setLoss(next)
  }, [])

  useEffect(() => {
    exposeDevClock()
  }, [])

  useEffect(
    () =>
      subscribeCamera(() => {
        setCamMode(cameraState.mode)
        setAttached(cameraState.attached)
      }),
    [],
  )

  useEffect(() => {
    if (!perfMode) return
    perfMonitor.enabled = true
    clockState.loopRef.current = true
    clockState.playingRef.current = true
  }, [perfMode])

  useEffect(() => {
    const id = window.setInterval(() => {
      setQualityLevel((current) => (current === qualityState.level ? current : qualityState.level))
    }, 250)
    const onResize = () => beginWarmup(qualityState, performance.now())
    window.addEventListener('resize', onResize)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!loss.lost) return
    const id = window.setInterval(() => {
      const next = noteContextLossTick(lossRef.current, performance.now())
      if (next !== lossRef.current) commitLoss(next)
    }, 250)
    return () => window.clearInterval(id)
  }, [loss.lost, commitLoss])

  const handleLost = useCallback(() => {
    pauseKeepingPlace()
    setHeldT(clockState.tRef.current)
    commitLoss(noteContextLost(lossRef.current, performance.now()))
  }, [commitLoss])

  const handleRestored = useCallback(() => {
    const next = noteContextRestored(lossRef.current)
    if (next.failed) {
      commitLoss(next)
      return
    }
    runContextRestore()
    noteRecovered(qualityState, performance.now())
    clockState.playingRef.current = false
    setHeldT(clockState.tRef.current)
    commitLoss(next)
  }, [commitLoss])

  const [frameloop, setFrameloop] = useState<'always' | 'demand' | 'never'>('demand')
  const [showRoutes, setShowRoutes] = useState(false)
  const onFrameloop = useCallback((mode: 'always' | 'demand' | 'never') => {
    setFrameloop((current) => (current === mode ? current : mode))
  }, [])
  const showQuarter = new URLSearchParams(window.location.search).get('rate') === '0.25'
  const gfx = !webglOk || loss.failed || forceFlat ? 'failed' : loss.lost ? 'lost' : 'ok'

  if (loaded.status === 'loading') {
    return (
      <p className="fallback loading-line" data-testid="loading">
        Loading play…
      </p>
    )
  }

  if (loaded.status === 'error') {
    return <LoadError errors={loaded.errors} url={loaded.url} onRetry={loaded.retry} />
  }

  if (!webglOk || loss.failed || forceFlat) {
    return (
      <div data-gfx={gfx}>
        <NoWebGL showReload={loss.failed || !webglOk || forceFlat} />
      </div>
    )
  }

  return (
    <div className="viewport" data-testid="viewport" data-dpr={dpr} data-gfx={gfx}>
      <Canvas
        frameloop={frameloop}
        dpr={dpr}
        resize={{ debounce: 100 }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
      >
        <color attach="background" args={['#cfe3f5']} />
        <Field
          config={fieldConfigFromSearch(window.location.search)}
          losX={loaded.play.meta.lineOfScrimmageX}
          ballY={loaded.play.meta.ballY}
          showSpot={new URLSearchParams(window.location.search).get('spot') === '1'}
        />
        <Players play={loaded.play} />
        <GestureInput play={loaded.play} onFrameloop={onFrameloop} />
        <CameraRig play={loaded.play} />
        <RouteLines
          play={loaded.play}
          visible={showRoutes && (QUALITY_LADDER[qualityLevel]?.features.has('routes') ?? false)}
        />
        <ClockMount />
        <RendererProbe onLost={handleLost} onRestored={handleRestored} />
      </Canvas>
      <div className="hud">
        <CameraBar play={loaded.play} onFrameloop={onFrameloop} />
        <div className="scrub-row">
          <HopChips play={loaded.play} onFrameloop={onFrameloop} />
          <Scrubber
            duration={loaded.play.meta.duration}
            startT={earliestWaypoint(loaded.play.wpT)}
            showQuarter={showQuarter}
            onFrameloop={onFrameloop}
          />
        </div>
      </div>
      <button type="button" className="btn route-toggle" onClick={() => setShowRoutes((v) => !v)}>
        {showRoutes ? 'Hide routes' : 'Show routes'}
      </button>
      {loaded.warnings.length > 0 && (
        <details className="banner" data-testid="warnings">
          <summary className="banner-summary">{loaded.warnings.length} warnings</summary>
          <ul>
            {loaded.warnings.map((warning) => (
              <li key={`${warning.path}:${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
        </details>
      )}
      {loss.lost && <ContextLossOverlay heldT={heldT} />}
      <FacemaskOverlay
        active={camMode === 'pov'}
        team={attached >= 0 && loaded.play.teams[attached] === 'defense' ? 'defense' : 'offense'}
      />
      {perfMode && <PerfOverlay />}
      <span data-testid="play-t" hidden>
        {heldT.toFixed(2)}
      </span>
    </div>
  )
}
