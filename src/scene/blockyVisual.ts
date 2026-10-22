import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshBasicMaterial,
  type Material,
} from 'three'
import type { Team } from '../play/types'
import { TEAM_COLOR, type PlayerVisual } from './playerVisual'

const TRIM: Record<Team, string> = {
  offense: '#7a0a1c',
  defense: '#2b2f36',
}
const SKIN = '#d7a37a'
const MASK = '#2a2a2a'

/** Jersey 0, trim 1, skin 2, facemask 3. Shade is the vertex color. */
function pushBox(
  positions: number[],
  colors: number[],
  parts: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  part: number,
): void {
  const quads: { shade: number; v: number[] }[] = [
    { shade: 0.75, v: [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1] },
    { shade: 0.75, v: [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0] },
    { shade: 1, v: [x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1] },
    { shade: 0.6, v: [x0, y0, z1, x0, y0, z0, x1, y0, z0, x1, y0, z1] },
    { shade: 0.85, v: [x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0] },
    { shade: 0.85, v: [x0, y0, z1, x0, y1, z1, x0, y1, z0, x0, y0, z0] },
  ]
  for (const quad of quads) {
    const v = quad.v
    const tris = [0, 1, 2, 0, 2, 3]
    for (const corner of tris) {
      positions.push(v[corner * 3] ?? 0, v[corner * 3 + 1] ?? 0, v[corner * 3 + 2] ?? 0)
      colors.push(quad.shade, quad.shade, quad.shade)
      parts.push(part)
    }
  }
}

function buildBlockyGeometry(): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const parts: number[] = []
  const box = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    part: number,
  ) => pushBox(positions, colors, parts, x0, y0, z0, x1, y1, z1, part)

  box(-0.12, 0, -0.28, 0.12, 0.92, -0.06, 1)
  box(-0.12, 0, 0.06, 0.12, 0.92, 0.28, 1)
  box(-0.16, 0.9, -0.46, 0.22, 1.58, 0.46, 0)
  box(0.02, 1.12, -0.62, 0.2, 1.5, -0.46, 2)
  box(0.02, 1.12, 0.46, 0.2, 1.5, 0.62, 2)
  box(-0.16, 1.58, -0.24, 0.2, 2.02, 0.24, 1)
  box(0.2, 1.62, -0.2, 0.32, 1.78, 0.2, 1)
  box(0.2, 1.7, -0.16, 0.34, 1.76, -0.1, 3)
  box(0.2, 1.7, 0.1, 0.34, 1.76, 0.16, 3)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aPart', new Float32BufferAttribute(parts, 1))
  return geometry
}

function partMaterial(team: Team): Material {
  const material = new MeshBasicMaterial({ color: '#ffffff', vertexColors: true })
  const trim = new Color(TRIM[team])
  const skin = new Color(SKIN)
  const mask = new Color(MASK)
  const jersey = new Color(TEAM_COLOR[team])
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uJersey'] = { value: jersey }
    shader.uniforms['uTrim'] = { value: trim }
    shader.uniforms['uSkin'] = { value: skin }
    shader.uniforms['uMask'] = { value: mask }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aPart;\nvarying float vPart;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uJersey;\nuniform vec3 uTrim;\nuniform vec3 uSkin;\nuniform vec3 uMask;\nvarying float vPart;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec3 partColor = uJersey;
         if (vPart > 2.5) partColor = uMask;
         else if (vPart > 1.5) partColor = uSkin;
         else if (vPart > 0.5) partColor = uTrim;
         diffuseColor.rgb *= partColor;`,
      )
  }
  return material
}

/** Eight blocks, feet at the origin, +X forward. */
export const blockyVisual: PlayerVisual = {
  geometry: buildBlockyGeometry(),
  createMaterial: partMaterial,
  numberAnchor: { chestHeight: 1.28, backOffset: 0.2, frontOffset: 0.26 },
  pickScale: 1.5,
  povHideRadius: 0.4,
}
