import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type Mesh } from 'three'
import type { CompiledPlay } from '../play/types'
import { yardsToWorld } from '../play/coords'
import { clockState } from '../playback/clockState'
import { sampleBall } from '../play/ball'
import { samplePlayer } from '../play/sample'
import type { BallPose } from '../play/types'
import type { PlayerPose } from '../play/types'
import { Ball } from './Ball'
import { buildJerseyAtlas, createNumberMaterial, jerseyCells } from './jerseyAtlas'
import { boxVisual, createNumberGeometry, type PlayerVisual } from './playerVisual'

const matrix = new Matrix4()
const quaternion = new Quaternion()
const position = new Vector3()
const scale = new Vector3(1, 1, 1)
const euler = new Euler()
const pose: PlayerPose = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 }
const ballPose: BallPose = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, carrierIndex: -1 }
const sampledXY = new Float32Array(64)
const sampledHeading = new Float32Array(32)
const sampledVel = new Float32Array(64)
const world = { x: 0, y: 0, z: 0 }

function writeFromSample(mesh: InstancedMesh | null, indexes: readonly number[]): void {
  if (mesh == null) return
  indexes.forEach((playerIndex, slot) => {
    const x = sampledXY[playerIndex * 2] ?? 0
    const y = sampledXY[playerIndex * 2 + 1] ?? 0
    const heading = sampledHeading[playerIndex] ?? 0
    yardsToWorld(x, y, 0, world)
    position.set(world.x, world.y, world.z)
    euler.set(0, heading, 0)
    quaternion.setFromEuler(euler)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(slot, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
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
  const offenseMat = useMemo(() => visual.createMaterial('offense'), [visual])
  const defenseMat = useMemo(() => visual.createMaterial('defense'), [visual])
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
      sampledXY[i * 2] = pose.x
      sampledXY[i * 2 + 1] = pose.y
      sampledHeading[i] = pose.heading
      sampledVel[i * 2] = pose.vx
      sampledVel[i * 2 + 1] = pose.vy
    }
    writeFromSample(offenseRef.current, offense)
    writeFromSample(defenseRef.current, defense)
    const numbers = numbersRef.current
    if (numbers != null) {
      order.forEach((playerIndex, slot) => {
        const x = sampledXY[playerIndex * 2] ?? 0
        const y = sampledXY[playerIndex * 2 + 1] ?? 0
        const heading = sampledHeading[playerIndex] ?? 0
        yardsToWorld(x, y, 0, world)
        position.set(world.x, world.y, world.z)
        euler.set(0, heading, 0)
        quaternion.setFromEuler(euler)
        matrix.compose(position, quaternion, scale)
        numbers.setMatrixAt(slot, matrix)
      })
      numbers.instanceMatrix.needsUpdate = true
    }
    sampleBall(play, time, sampledXY, sampledHeading, sampledVel, ballPose)
    yardsToWorld(ballPose.x, ballPose.y, ballPose.z, world)
    const ball = ballRef.current
    if (ball != null) {
      ball.position.set(world.x, world.y, world.z)
      const yaw =
        ballPose.carrierIndex >= 0
          ? (sampledHeading[ballPose.carrierIndex] ?? 0)
          : Math.atan2(ballPose.vy, ballPose.vx)
      ball.rotation.set(0, yaw, 0)
    }
  }

  useLayoutEffect(() => {
    const cells = order.map((index) => play.jerseys[index] ?? 0)
    numberGeo.setAttribute('aCell', jerseyCells(cells))
    place(t, 1)
    seenT.current = t
    // place closes over the latest play; the frame loop reads the clock ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, t, offense, defense, order, numberGeo])

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
        args={[visual.geometry, offenseMat, offense.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={defenseRef}
        args={[visual.geometry, defenseMat, defense.length]}
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
