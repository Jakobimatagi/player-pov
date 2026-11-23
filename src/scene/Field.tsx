import { useEffect, useMemo } from 'react'
import { fieldConfig, type FieldConfig } from '../field/fieldConfig'
import { yardsToWorld } from '../play/coords'
import { useThemePalette } from '../theme/useScenePalette'
import { buildFieldMarkings, buildGrass } from './fieldMarkings'

/**
 * Grass plus one markings mesh, in the theme's field colours. `?spot=1` drops a sphere on the
 * ball mark.
 */
export function Field({
  config,
  losX,
  ballY,
  showSpot,
}: {
  config: FieldConfig
  losX: number
  ballY: number
  showSpot: boolean
}) {
  const palette = useThemePalette().field
  const grass = useMemo(() => buildGrass(palette), [palette])
  const markings = useMemo(
    () => buildFieldMarkings(fieldConfig(config.hashRule), palette),
    [config.hashRule, palette],
  )
  useEffect(() => () => grass.dispose(), [grass])
  useEffect(() => () => markings.dispose(), [markings])
  const spot = useMemo(() => yardsToWorld(losX, ballY, 0.45, { x: 0, y: 0, z: 0 }), [losX, ballY])

  return (
    <group>
      <mesh geometry={grass} frustumCulled={false}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <mesh geometry={markings} frustumCulled={false}>
        <meshBasicMaterial
          vertexColors
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {showSpot && (
        <mesh position={[spot.x, spot.y, spot.z]}>
          <sphereGeometry args={[0.4, 12, 8]} />
          <meshBasicMaterial color={palette.spot} />
        </mesh>
      )}
    </group>
  )
}
