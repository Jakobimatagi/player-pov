import {
  CanvasTexture,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  SRGBColorSpace,
  type Material,
} from 'three'

const ATLAS = 1024
const CELLS = 10

export function buildJerseyAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS
  canvas.height = ATLAS
  const ctx = canvas.getContext('2d')
  if (ctx != null) {
    ctx.clearRect(0, 0, ATLAS, ATLAS)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 72px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cell = ATLAS / CELLS
    for (let n = 0; n < 100; n += 1) {
      const col = n % CELLS
      const row = Math.floor(n / CELLS)
      ctx.fillText(String(n), col * cell + cell / 2, row * cell + cell / 2)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export function createNumberMaterial(atlas: CanvasTexture): Material {
  const material = new MeshBasicMaterial({
    map: atlas,
    transparent: true,
    alphaTest: 0.4,
    toneMapped: false,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  float cellCol = mod(aCell, 10.0);
  float cellRow = floor(aCell / 10.0);
  vMapUv = vec2((cellCol + uv.x) / 10.0, 1.0 - (cellRow + 1.0 - uv.y) / 10.0);
#endif`,
      )
  }
  return material
}

export function jerseyCells(jerseys: ArrayLike<number>): InstancedBufferAttribute {
  const values = new Float32Array(jerseys.length)
  for (let i = 0; i < jerseys.length; i += 1) values[i] = jerseys[i] ?? 0
  return new InstancedBufferAttribute(values, 1)
}
