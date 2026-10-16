import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  type Material,
} from 'three'
import type { Team } from '../play/types'

export interface NumberAnchor {
  chestHeight: number
  backOffset: number
  frontOffset: number
}

export interface PlayerVisual {
  geometry: BufferGeometry
  createMaterial(team: Team): Material
  numberAnchor: NumberAnchor
  pickScale: number
  povHideRadius: number
}

export const TEAM_COLOR: Record<Team, string> = {
  offense: '#c8102e',
  defense: '#f2f2f2',
}

function buildBoxGeometry(): BufferGeometry {
  const geometry = new BoxGeometry(0.6, 2, 0.9)
  geometry.translate(0, 1, 0)
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i += 1) {
    const nx = normal.getX(i) ?? 0
    const ny = normal.getY(i) ?? 0
    const shade = ny > 0.5 ? 1 : ny < -0.5 ? 0.6 : Math.abs(nx) > 0.5 ? 0.85 : 0.75
    colors[i * 3] = shade
    colors[i * 3 + 1] = shade
    colors[i * 3 + 2] = shade
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

function pushQuad(
  positions: number[],
  uvs: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
): void {
  // a-d-c / a-c-b. The opposite order points into the box and the camera culls it.
  positions.push(...a, ...d, ...c, ...a, ...c, ...b)
  // u = 0 was on the viewer's right, so the glyph read backwards.
  uvs.push(1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0)
}

/** Chest, back, and both sides so a sideline camera can read the jersey. */
export function createNumberGeometry(anchor: NumberAnchor): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const y0 = anchor.chestHeight - 0.28
  const y1 = anchor.chestHeight + 0.28
  const halfW = 0.26
  const side = 0.46
  pushQuad(
    positions,
    uvs,
    [anchor.frontOffset, y0, -halfW],
    [anchor.frontOffset, y0, halfW],
    [anchor.frontOffset, y1, halfW],
    [anchor.frontOffset, y1, -halfW],
  )
  pushQuad(
    positions,
    uvs,
    [-anchor.backOffset, y0, halfW],
    [-anchor.backOffset, y0, -halfW],
    [-anchor.backOffset, y1, -halfW],
    [-anchor.backOffset, y1, halfW],
  )
  pushQuad(
    positions,
    uvs,
    [halfW, y0, side],
    [-halfW, y0, side],
    [-halfW, y1, side],
    [halfW, y1, side],
  )
  pushQuad(
    positions,
    uvs,
    [-halfW, y0, -side],
    [halfW, y0, -side],
    [halfW, y1, -side],
    [-halfW, y1, -side],
  )
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  return geometry
}

/** Invisible 1.5× pick proxy. Raycasts hit it; it does not write color or depth. */
export function createPickMaterial(): Material {
  return new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
  })
}

export const boxVisual: PlayerVisual = {
  geometry: buildBoxGeometry(),
  createMaterial(team) {
    return new MeshBasicMaterial({ color: TEAM_COLOR[team], vertexColors: true })
  },
  numberAnchor: { chestHeight: 1.35, backOffset: 0.32, frontOffset: 0.32 },
  pickScale: 1.5,
  povHideRadius: 0.4,
}
