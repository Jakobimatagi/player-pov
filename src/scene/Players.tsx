import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import type { CompiledPlay } from '../play/types'
import { yardsToWorld } from '../play/coords'
import { clockState } from '../playback/clockState'
import { samplePlayer } from '../play/sample'
import type { PlayerPose } from '../play/types'
import { buildJerseyAtlas, createNumberMaterial, jerseyCells } from './jerseyAtlas'
import { boxVisual, createNumberGeometry, type PlayerVisual } from './playerVisual'

const matrix = new Matrix4()
const quaternion = new Quaternion()
const position = new Vector3()
const scale = new Vector3(1, 1, 1)
const euler = new Euler()
const pose: PlayerPose = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 }
const world = { x: 0, y: 0, z: 0 }

function writeTeam(
  mesh: InstancedMesh | null,
  play: CompiledPlay,
  indexes: readonly number[],
  t: number,
  dt: number,
): void {
  if (mesh == null) return
  indexes.forEach((playerIndex, slot) => {
    samplePlayer(play, playerIndex, t, dt, pose)
    yardsToWorld(pose.x, pose.y, 0, world)
    position.set(world.x, world.y, world.z)
    euler.set(0, pose.heading, 0)
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
    writeTeam(offenseRef.current, play, offense, time, dt)
    writeTeam(defenseRef.current, play, defense, time, dt)
    const numbers = numbersRef.current
    if (numbers == null) return
    order.forEach((playerIndex, slot) => {
      samplePlayer(play, playerIndex, time, dt, pose)
      yardsToWorld(pose.x, pose.y, 0, world)
      position.set(world.x, world.y, world.z)
      euler.set(0, pose.heading, 0)
      quaternion.setFromEuler(euler)
      matrix.compose(position, quaternion, scale)
      numbers.setMatrixAt(slot, matrix)
    })
    numbers.instanceMatrix.needsUpdate = true
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
    </group>
  )
}
