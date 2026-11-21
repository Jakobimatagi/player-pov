import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
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
import { gyroListening, gyroState } from './camera/gyro'
import { lookState } from './camera/look'
import { clockState, earliestWaypoint, pauseKeepingPlace } from './playback/clockState'
import { useClock } from './playback/useClock'
import { draftBackTarget, playsBackTarget } from './play/draftBack'
import { isSavedPlayId, playInputFromLocation, usePlayInput } from './play/usePlay'
import { fieldConfigFromSearch } from './field/fieldConfig'
import { CameraRig } from './scene/CameraRig'
import { Field } from './scene/Field'
import { GestureInput } from './scene/GestureInput'
import { Players } from './scene/Players'
import { RouteLines } from './scene/RouteLines'
import { CameraBar, HopChips } from './ui/CameraBar'
import { FacemaskOverlay } from './ui/FacemaskOverlay'
import {
  cameraState,
  lockToPlayer,
  notePlay,
  subscribeCamera,
  unlockPlayer,
} from './camera/cameraState'
import { watchLabel } from './ui/watchLabel'
import { AssignSlots } from './viewer/AssignSlots'
import { RuleCard } from './viewer/RuleCard'
import { RulesPanel } from './viewer/RulesPanel'
import { useRules } from './viewer/useRules'
import { useViewerAccess } from './viewer/useViewerAccess'
import { Scrubber } from './ui/Scrubber'
import { ContextLossOverlay } from './ui/ContextLossOverlay'
import { LoadError } from './ui/LoadError'
import { NoWebGL } from './ui/NoWebGL'

function exposeDevClock(): void {
  if (!import.meta.env.DEV) return
  window.__pov = {
    tRef: clockState.tRef,
    playingRef: clockState.playingRef,
    look: lookState,
    gyro: gyroState,
    gyroListening,
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
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const input = playInputFromLocation(window.location.search, {
    playId: params.playId,
    draftKey: params.draftKey,
  })
  const loaded = usePlayInput(input)
  const backToPlays = () => {
    const target = playsBackTarget(location.key)
    if (target === -1) void navigate(-1)
    else void navigate(target)
  }
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
  const gfx = !webglOk || loss.failed || forceFlat ? 'failed' : loss.lost ? 'lost' : 'ok'

  const playId = input.kind === 'id' ? input.playId : null
  const readyPlay = loaded.status === 'ready' ? loaded.play : null
  const access = useViewerAccess(playId, readyPlay?.ids ?? null)
  const lockIndex = access.kind === 'locked' ? access.index : -1
  const savedId = isSavedPlayId(playId) ? playId : null
  const { rules, version: rulesVersion, replace: replaceRule } = useRules(savedId)
  const [coachPanel, setCoachPanel] = useState<'assign' | 'rules' | null>(null)

  // Lock before paint so a locked player never sees another player's view.
  useLayoutEffect(() => {
    if (readyPlay == null || lockIndex < 0) {
      unlockPlayer()
      return
    }
    const qb = readyPlay.positions.indexOf('QB')
    notePlay(readyPlay.meta.id, qb >= 0 ? qb : 0)
    lockToPlayer(lockIndex)
    // Wake the demand frameloop so the camera glides onto the locked player.
    const frame = requestAnimationFrame(() => onFrameloop('always'))
    return () => {
      cancelAnimationFrame(frame)
      unlockPlayer()
    }
  }, [readyPlay, lockIndex, onFrameloop])

  if (loaded.status === 'ready' && access.kind === 'error') {
    return (
      <div className="fallback" data-testid="access-error">
        <p>Couldn&apos;t load your position for this play.</p>
        <button type="button" className="btn primary" onClick={access.retry}>
          Try again
        </button>
      </div>
    )
  }

  if (loaded.status === 'loading' || (loaded.status === 'ready' && access.kind === 'loading')) {
    return (
      <p className="fallback loading-line" data-testid="loading">
        Loading play…
      </p>
    )
  }

  if (loaded.status === 'error') {
    return (
      <LoadError
        errors={loaded.errors}
        url={loaded.url}
        onRetry={loaded.retry}
        onBack={input.kind === 'id' ? backToPlays : undefined}
      />
    )
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
        <CameraBar
          play={loaded.play}
          onFrameloop={onFrameloop}
          lockedLabel={
            lockIndex >= 0
              ? watchLabel(
                  loaded.play.ids[lockIndex] ?? '',
                  loaded.play.positions[lockIndex] ?? '',
                  loaded.play.jerseys[lockIndex] ?? 0,
                )
              : undefined
          }
        />
        <div className="scrub-row">
          <HopChips play={loaded.play} onFrameloop={onFrameloop} />
          <Scrubber
            duration={loaded.play.meta.duration}
            startT={earliestWaypoint(loaded.play.wpT)}
            onFrameloop={onFrameloop}
          />
        </div>
      </div>
      {input.kind === 'draft' && (
        <button
          type="button"
          className="btn back-to-editor"
          onClick={() => {
            // TODO(C7): navigate to /plays/<id>/edit
            if (draftBackTarget(location.key) === -1) navigate(-1)
            else navigate('/')
          }}
        >
          Back to editor
        </button>
      )}
      {input.kind === 'id' && (
        <button type="button" className="btn back-to-editor" onClick={backToPlays}>
          Back to plays
        </button>
      )}
      <button type="button" className="btn route-toggle" onClick={() => setShowRoutes((v) => !v)}>
        {showRoutes ? 'Hide routes' : 'Show routes'}
      </button>
      {access.kind === 'free' && access.staff && savedId != null && access.teamId != null && (
        <>
          <AssignSlots
            play={loaded.play}
            playId={savedId}
            teamId={access.teamId}
            open={coachPanel === 'assign'}
            setOpen={(open) => setCoachPanel(open ? 'assign' : null)}
          />
          <RulesPanel
            play={loaded.play}
            playId={savedId}
            teamId={access.teamId}
            role={access.role}
            mySide={access.side}
            rules={rules}
            rulesVersion={rulesVersion}
            onSaved={replaceRule}
            open={coachPanel === 'rules'}
            setOpen={(open) => setCoachPanel(open ? 'rules' : null)}
          />
        </>
      )}
      <div className="viewer-notes">
        {access.kind === 'unassigned' && (
          <p className="player-note" role="status" data-testid="unassigned-note">
            Your coach hasn&apos;t given you a position on this play yet. You can watch any player.
          </p>
        )}
        {savedId != null && coachPanel == null && (
          <RuleCard play={loaded.play} rules={rules} locked={lockIndex >= 0} />
        )}
      </div>
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
