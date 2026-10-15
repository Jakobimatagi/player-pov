/** Field yards are JSON space. Three.js Y-up, 1 unit = 1 yard. Only this module converts. */

export const FIELD_LENGTH = 120
export const FIELD_WIDTH = 53.333
export const FIELD_CENTER_Y = 26.667

export interface WorldPoint {
  x: number
  y: number
  z: number
}

/** world.x = x − 60, world.y = height, world.z = −(y − 26.667). */
export function yardsToWorld(x: number, y: number, height: number, out: WorldPoint): WorldPoint {
  out.x = x - FIELD_LENGTH / 2
  out.y = height
  out.z = -(y - FIELD_CENTER_Y)
  return out
}
