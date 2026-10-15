import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Raycaster, Vector2 } from 'three'
import { attachPlayer, cameraState, detachPlayer, povAttached } from '../camera/cameraState'
import { hopInTeam, nearestOpponent } from '../camera/hop'
import { nudgeBroadcastDistance, nudgeOrbit, nudgeTopZoom } from '../camera/orbit'
import { createTracker, noteDown, noteMove, noteUp } from '../input/gesture'
import type { CompiledPlay } from '../play/types'
import { poseXY } from './framePose'

const raycaster = new Raycaster()
const ndc = new Vector2()

/** Pointer gestures on the canvas. The scrubber is outside, so its swipes never hop. */
export function GestureInput({
  play,
  onFrameloop,
}: {
  play: CompiledPlay
  onFrameloop: (mode: 'always' | 'demand' | 'never') => void
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const cameraRef = useRef(camera)
  const sceneRef = useRef(scene)
  const tracker = useMemo(() => createTracker(), [])
  const qb = play.positions.indexOf('QB')
  const qbIndex = qb >= 0 ? qb : 0

  useEffect(() => {
    cameraRef.current = camera
    sceneRef.current = scene
  }, [camera, scene])

  useEffect(() => {
    const canvas = gl.domElement
    const wake = () => {
      if (cameraState.movingRef.current) onFrameloop('always')
    }
    const playerAt = (event: PointerEvent): number => {
      const rect = canvas.getBoundingClientRect()
      const width = rect.width || 1
      const height = rect.height || 1
      ndc.x = ((event.clientX - rect.left) / width) * 2 - 1
      ndc.y = -((event.clientY - rect.top) / height) * 2 + 1
      raycaster.setFromCamera(ndc, cameraRef.current)
      const hits = raycaster.intersectObjects(sceneRef.current.children, true)
      for (const hit of hits) {
        const indexes = hit.object.userData['indexes'] as readonly number[] | undefined
        if (indexes == null) continue
        const index = indexes[hit.instanceId ?? -1]
        if (index != null) return index
      }
      return -1
    }
    const down = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId) === false) {
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          /* The pointer can already be gone. */
        }
      }
      noteDown(
        tracker,
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
        playerAt(event),
      )
    }
    const move = (event: PointerEvent) => {
      const result = noteMove(
        tracker,
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
        cameraState.mode,
        cameraState.attached >= 0,
      )
      const now = event.timeStamp / 1000
      if (result.kind === 'orbit') nudgeOrbit(result.dx, result.dy, now)
      else if (result.kind === 'pinch' && cameraState.mode === 'broadcast')
        nudgeBroadcastDistance(result.scale, now)
      else if (result.kind === 'pinch' && cameraState.mode === 'topdown')
        nudgeTopZoom(result.scale, now)
      else return
      cameraState.movingRef.current = true
      wake()
    }
    const up = (event: PointerEvent) => {
      const result = noteUp(
        tracker,
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
        cameraState.attached >= 0,
      )
      if (result.kind === 'tap') {
        if (result.player >= 0) attachPlayer(result.player)
        else if (cameraState.mode !== 'pov') detachPlayer()
      } else if (result.kind === 'double-tap' && result.player >= 0) {
        attachPlayer(result.player)
        povAttached(qbIndex)
      } else if (result.kind === 'swipe-x' && cameraState.attached >= 0) {
        attachPlayer(hopInTeam(play, cameraState.attached, result.dir))
      } else if (result.kind === 'swipe-y' && cameraState.attached >= 0) {
        attachPlayer(nearestOpponent(play, cameraState.attached, poseXY))
      } else return
      wake()
    }
    const cancel = (event: PointerEvent) => {
      if (tracker.id === event.pointerId || tracker.id2 === event.pointerId) {
        tracker.active = false
        tracker.two = false
      }
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
    }
  }, [gl, tracker, play, qbIndex, onFrameloop])

  return null
}
