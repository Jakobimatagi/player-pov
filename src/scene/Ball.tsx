import { forwardRef, useMemo } from 'react'
import type { Mesh } from 'three'
import { useThemePalette } from '../theme/useScenePalette'
import { buildBallGeometry } from './ballGeometry'

/** Moved by the player frame, so the ball is not its own useFrame subscriber. */
export const Ball = forwardRef<Mesh>(function Ball(_props, ref) {
  const geometry = useMemo(() => buildBallGeometry(), [])
  const color = useThemePalette().field.ball
  return (
    <mesh ref={ref} geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial color={color} />
    </mesh>
  )
})
