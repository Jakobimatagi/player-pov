import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Mesh,
} from 'three'
import { cameraState } from '../camera/cameraState'
import { povFade } from '../camera/modes'
import type { CompiledPlay } from '../play/types'
import { yardsToWorld } from '../play/coords'
import { clockState } from '../playback/clockState'
import { sampleBall } from '../play/ball'
import { samplePlayer } from '../play/sample'
import type { PlayerPose } from '../play/types'
import { Ball } from './Ball'
import { poseHeading, poseVel, poseXY, publishedBall } from './framePose'
import { withInstanceFade } from './instanceFade'
import { buildJerseyAtlas, createNumberMaterial, jerseyCells } from './jerseyAtlas'
import {
  boxVisual,
  createNumberGeometry,
  createPickMaterial,
  type PlayerVisual,
} from './playerVisual'

const matrix = new Matrix4()
const quaternion = new Quaternion()
const position = new Vector3()
const scale = new Vector3(1, 1, 1)
const euler = new Euler()
const pose: PlayerPose = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 }
const world = { x: 0, y: 0, z: 0 }
const white = new Color(1, 1, 1)
const highlight = new Color(1, 0.78, 0.2)

function hiddenIndex(): number {
  if (cameraState.mode !== 'pov') return -1
  if (cameraState.attached >= 0) return cameraState.attached
  return cameraState.povSubject
}

function fadeOf(playerIndex: number, self: number, radius: number): number {
  if (self < 0 || playerIndex === self) return 1
  const face = poseHeading[self] ?? 0
  const eyeX = (poseXY[self * 2] ?? 0) + Math.cos(face) * 0.15
  const eyeY = (poseXY[self * 2 + 1] ?? 0) + Math.sin(face) * 0.15
  const dist = Math.hypot(
    eyeX - (poseXY[playerIndex * 2] ?? 0),
    eyeY - (poseXY[playerIndex * 2 + 1] ?? 0),
    0.75,
  )
  return povFade(dist, radius)
}

function writeFromSample(
  mesh: InstancedMesh | null,
  indexes: readonly number[],
  hide: number,
  radius: number,
): void {
  if (mesh == null) return
  const fadeAttr = mesh.geometry.getAttribute('aFade')
  indexes.forEach((playerIndex, slot) => {
    const x = poseXY[playerIndex * 2] ?? 0
    const y = poseXY[playerIndex * 2 + 1] ?? 0
    const heading = poseHeading[playerIndex] ?? 0
    const gone = playerIndex === hide
    scale.set(gone ? 0 : 1, gone ? 0 : 1, gone ? 0 : 1)
    yardsToWorld(x, y, 0, world)
    position.set(world.x, world.y, world.z)
    euler.set(0, heading, 0)
    quaternion.setFromEuler(euler)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(slot, matrix)
    if (fadeAttr != null) fadeAttr.setX(slot, gone ? 1 : fadeOf(playerIndex, hide, radius))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  if (fadeAttr != null) fadeAttr.needsUpdate = true
}

/** Instanced bodies from a PlayerVisual, plus one number mesh. */
export function Players({
  play,
  t = 0,
  visual = boxVisual,
}: {
  play: CompiledPlay
  t?: number
  visual?: PlayerVisual
}) {
  const ballRef = useRef<Mesh>(null)
  const offenseRef = useRef<InstancedMesh>(null)
  const defenseRef = useRef<InstancedMesh>(null)
  const numbersRef = useRef<InstancedMesh>(null)
  const offensePickRef = useRef<InstancedMesh>(null)
  const defensePickRef = useRef<InstancedMesh>(null)
  const offenseGeo = useMemo(() => visual.geometry.clone(), [visual])
  const defenseGeo = useMemo(() => visual.geometry.clone(), [visual])
  const pickGeo = useMemo(() => {
    const geo = visual.geometry.clone()
    geo.scale(visual.pickScale, visual.pickScale, visual.pickScale)
    return geo
  }, [visual])
  const pickMat = useMemo(() => createPickMaterial(), [])
  const offenseMat = useMemo(() => withInstanceFade(visual.createMaterial('offense')), [visual])
  const defenseMat = useMemo(() => withInstanceFade(visual.createMaterial('defense')), [visual])
  const numberGeo = useMemo(() => createNumberGeometry(visual.numberAnchor), [visual])
  const numberMat = useMemo(() => createNumberMaterial(buildJerseyAtlas()), [])
  const offense = useMemo(
    () => play.teams.flatMap((team, index) => (team === 'offense' ? [index] : [])),
    [play],
  )
  const defense = useMemo(
    () => play.teams.flatMap((team, index) => (team === 'defense' ? [index] : [])),
    [play],
  )
  const order = useMemo(() => [...offense, ...defense], [offense, defense])

  const seenT = useRef(t)
  const place = (time: number, dt: number) => {
    for (let i = 0; i < play.count; i += 1) {
      samplePlayer(play, i, time, dt, pose)
      poseXY[i * 2] = pose.x
      poseXY[i * 2 + 1] = pose.y
      poseHeading[i] = pose.heading
      poseVel[i * 2] = pose.vx
      poseVel[i * 2 + 1] = pose.vy
    }
    const hide = hiddenIndex()
    writeFromSample(offenseRef.current, offense, hide, visual.povHideRadius)
    writeFromSample(defenseRef.current, defense, hide, visual.povHideRadius)
    writeFromSample(offensePickRef.current, offense, hide, visual.povHideRadius)
    writeFromSample(defensePickRef.current, defense, hide, visual.povHideRadius)
    const numbers = numbersRef.current
    if (numbers != null) {
      order.forEach((playerIndex, slot) => {
        const x = poseXY[playerIndex * 2] ?? 0
        const y = poseXY[playerIndex * 2 + 1] ?? 0
        const heading = poseHeading[playerIndex] ?? 0
        const gone = playerIndex === hide
        scale.set(gone ? 0 : 1, gone ? 0 : 1, gone ? 0 : 1)
        yardsToWorld(x, y, 0, world)
        position.set(world.x, world.y, world.z)
        euler.set(0, heading, 0)
        quaternion.setFromEuler(euler)
        matrix.compose(position, quaternion, scale)
        numbers.setMatrixAt(slot, matrix)
        numbers.setColorAt(slot, playerIndex === cameraState.attached ? highlight : white)
      })
      numbers.instanceMatrix.needsUpdate = true
      if (numbers.instanceColor != null) numbers.instanceColor.needsUpdate = true
    }
    sampleBall(play, time, poseXY, poseHeading, poseVel, publishedBall)
    yardsToWorld(publishedBall.x, publishedBall.y, publishedBall.z, world)
    const ball = ballRef.current
    if (ball != null) {
      ball.position.set(world.x, world.y, world.z)
      const yaw =
        publishedBall.carrierIndex >= 0
          ? (poseHeading[publishedBall.carrierIndex] ?? 0)
          : Math.atan2(publishedBall.vy, publishedBall.vx)
      ball.rotation.set(0, yaw, 0)
    }
  }

  useLayoutEffect(() => {
    const arm = (mesh: InstancedMesh | null) => {
      if (mesh == null) return
      const fade = new Float32Array(mesh.count)
      fade.fill(1)
      mesh.geometry.setAttribute('aFade', new InstancedBufferAttribute(fade, 1))
    }
    arm(offenseRef.current)
    arm(defenseRef.current)
    if (offensePickRef.current != null) offensePickRef.current.userData['indexes'] = offense
    if (defensePickRef.current != null) defensePickRef.current.userData['indexes'] = defense
    const cells = order.map((index) => play.jerseys[index] ?? 0)
    numberGeo.setAttribute('aCell', jerseyCells(cells))
    place(t, 1)
    seenT.current = t
    // place closes over the latest play; the frame loop reads the clock ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, t, offense, defense, order, numberGeo, offenseGeo, defenseGeo])

  useFrame((_, delta) => {
    const time = clockState.tRef.current
    const jump = Math.abs(time - seenT.current)
    place(time, jump > 0.1 ? 1 : Math.min(delta, 0.1))
    seenT.current = time
  }, 0)

  return (
    <group>
      <instancedMesh
        ref={offenseRef}
        args={[offenseGeo, offenseMat, offense.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={defenseRef}
        args={[defenseGeo, defenseMat, defense.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={offensePickRef}
        args={[pickGeo, pickMat, offense.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={defensePickRef}
        args={[pickGeo, pickMat, defense.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={numbersRef}
        args={[numberGeo, numberMat, order.length]}
        frustumCulled={false}
      />
      <Ball ref={ballRef} />
    </group>
  )
}
