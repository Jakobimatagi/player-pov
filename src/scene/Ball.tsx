import { forwardRef, useMemo } from 'react'
import type { Mesh } from 'three'
import { buildBallGeometry } from './ballGeometry'

/** Moved by the player frame, so the ball is not its own useFrame subscriber. */
export const Ball = forwardRef<Mesh>(function Ball(_props, ref) {
  const geometry = useMemo(() => buildBallGeometry(), [])
  return (
    <mesh ref={ref} geometry={geometry} frustumCulled={false}>
      <meshLambertMaterial color="#c4a574" />
    </mesh>
  )
})
