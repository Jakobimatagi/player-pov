import { useMemo } from 'react'
import { fieldConfig, type FieldConfig } from '../field/fieldConfig'
import { yardsToWorld } from '../play/coords'
import { buildFieldMarkings, buildGrass } from './fieldMarkings'

/** Grass plus one markings mesh. `?spot=1` drops a sphere on the ball mark. */
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
  const grass = useMemo(() => buildGrass(), [])
  const markings = useMemo(
    () => buildFieldMarkings(fieldConfig(config.hashRule)),
    [config.hashRule],
  )
  const spot = useMemo(() => yardsToWorld(losX, ballY, 0.45, { x: 0, y: 0, z: 0 }), [losX, ballY])

  return (
    <group>
      <hemisphereLight args={['#f4f7fb', '#3f8f3a', 0.85]} />
      <directionalLight position={[20, 40, 10]} intensity={0.9} />
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
          <meshBasicMaterial color="#c8102e" />
        </mesh>
      )}
    </group>
  )
}
