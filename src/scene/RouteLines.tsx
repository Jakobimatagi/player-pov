import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { CompiledPlay } from '../play/types'
import { yardsToWorld } from '../play/coords'

function buildRoutes(play: CompiledPlay): BufferGeometry {
  const positions: number[] = []
  const world = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < play.count; i += 1) {
    const start = play.wpStart[i] ?? 0
    const end = play.wpStart[i + 1] ?? start
    for (let k = start; k < end - 1; k += 1) {
      yardsToWorld(play.wpX[k] ?? 0, play.wpY[k] ?? 0, 0.08, world)
      positions.push(world.x, world.y, world.z)
      yardsToWorld(play.wpX[k + 1] ?? 0, play.wpY[k + 1] ?? 0, 0.08, world)
      positions.push(world.x, world.y, world.z)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

/** Waypoint chords. Off unless the debug toggle is on. Not a useFrame subscriber. */
export function RouteLines({ play, visible }: { play: CompiledPlay; visible: boolean }) {
  const geometry = useMemo(() => buildRoutes(play), [play])
  if (!visible) return null
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#fff4c2" />
    </lineSegments>
  )
}
