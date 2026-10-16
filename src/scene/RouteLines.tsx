import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import type { CompiledPlay } from '../play/types'
import { buildRouteRibbon, createRouteMaterial, sizeRouteMaterial } from './routeRibbon'

/** Screen-space waypoint ribbons. Off unless the debug toggle is on. One draw. */
export function RouteLines({ play, visible }: { play: CompiledPlay; visible: boolean }) {
  const geometry = useMemo(() => buildRouteRibbon(play), [play])
  const material = useMemo(() => createRouteMaterial(), [])
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  useLayoutEffect(() => {
    sizeRouteMaterial(material, size.width, size.height, dpr)
  }, [material, size.width, size.height, dpr])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  if (!visible) return null
  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  )
}
