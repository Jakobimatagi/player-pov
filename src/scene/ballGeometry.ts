import { SphereGeometry } from 'three'

/** Prolate low-poly ball. 8×6 sphere is 80 triangles, then stretched along +X. */
export function buildBallGeometry(): SphereGeometry {
  const geometry = new SphereGeometry(0.15, 8, 6)
  geometry.scale(1.55, 0.85, 0.85)
  return geometry
}
