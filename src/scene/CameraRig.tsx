import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { OrthographicCamera, PerspectiveCamera } from 'three'
import { cameraState } from '../camera/cameraState'
import { createRigState, stepRig, type RigInput } from '../camera/modes'
import { clockState } from '../playback/clockState'
import type { CompiledPlay } from '../play/types'
import { poseHeading, poseXY, publishedBall } from './framePose'

/** Perspective for POV and Broadcast, orthographic for Top-down. Priority 1. */
export function CameraRig({ play }: { play: CompiledPlay }) {
  const persp = useMemo(() => new PerspectiveCamera(40, 1, 0.1, 500), [])
  const ortho = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0.1, 400), [])
  const rig = useMemo(() => createRigState(), [])
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const shown = useRef<PerspectiveCamera | OrthographicCamera | null>(null)
  const prevT = useRef(0)
  const input = useMemo<RigInput>(
    () => ({
      now: 0,
      dt: 0,
      playT: 0,
      prevPlayT: 0,
      mode: 'broadcast',
      attached: -1,
      qbIndex: 0,
      count: 0,
      xy: poseXY,
      headingArr: poseHeading,
      ballX: 0,
      ballY: 0,
      ballZ: 0,
      ballCarrier: -1,
      viewWidth: 1,
      viewHeight: 1,
      transitionUntil: 0,
    }),
    [],
  )
  const qb = play.positions.indexOf('QB')
  const qbIndex = qb >= 0 ? qb : 0

  const apply = (viewWidth: number, viewHeight: number) => {
    const cam = rig.usingOrtho ? ortho : persp
    cam.up.set(rig.upX, rig.upY, rig.upZ)
    cam.position.set(rig.x, rig.y, rig.z)
    cam.lookAt(rig.lookX, rig.lookY, rig.lookZ)
    if (cam === persp) {
      const aspect = viewHeight === 0 ? 1 : viewWidth / viewHeight
      const aspectChanged = Math.abs(persp.aspect - aspect) > 0.0001
      if (rig.fovDirty || aspectChanged) {
        persp.fov = rig.fov
        persp.aspect = aspect
        persp.updateProjectionMatrix()
      }
    } else {
      ortho.left = -viewWidth / 2
      ortho.right = viewWidth / 2
      ortho.top = viewHeight / 2
      ortho.bottom = -viewHeight / 2
      ortho.zoom = rig.zoom
      ortho.updateProjectionMatrix()
    }
    if (shown.current !== cam) {
      shown.current = cam
      set({ camera: cam })
    }
  }

  const frame = (now: number, dt: number, playT: number) => {
    input.now = now
    input.dt = dt
    input.playT = playT
    input.prevPlayT = prevT.current
    input.mode = cameraState.mode
    input.attached = cameraState.attached
    input.qbIndex = qbIndex
    input.count = play.count
    input.xy = poseXY
    input.headingArr = poseHeading
    input.ballX = publishedBall.x
    input.ballY = publishedBall.y
    input.ballZ = publishedBall.z
    input.ballCarrier = publishedBall.carrierIndex
    input.viewWidth = size.width
    input.viewHeight = size.height
    input.transitionUntil = cameraState.transitionUntil
    stepRig(rig, input)
    if (cameraState.mode === 'pov' && cameraState.attached < 0) cameraState.attached = qbIndex
    cameraState.movingRef.current = rig.moving
    apply(size.width, size.height)
    prevT.current = playT
  }

  useLayoutEffect(() => {
    rig.initialized = false
    frame(performance.now() / 1000, 0, clockState.tRef.current)
    // Snap once the player frame has published poses. frame closes over play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play])

  useFrame((_, delta) => {
    frame(performance.now() / 1000, Math.min(delta, 0.1), clockState.tRef.current)
  }, 1)

  return null
}
