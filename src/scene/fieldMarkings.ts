import { BufferGeometry, Float32BufferAttribute } from 'three'
import { FIELD_CENTER_Y, FIELD_LENGTH, FIELD_WIDTH } from '../play/coords'
import type { FieldConfig } from '../field/fieldConfig'

const WHITE: readonly [number, number, number] = [1, 1, 1]
const YELLOW: readonly [number, number, number] = [0.93, 0.75, 0.15]
const GRASS_A: readonly [number, number, number] = [63 / 255, 143 / 255, 58 / 255]
const GRASS_B: readonly [number, number, number] = [54 / 255, 128 / 255, 50 / 255]

const YARD_LINE_W = 4 / 36
const BOUNDARY_W = 6 / 36
const MARK_Y = 0.03

const DIGIT_ON: Record<string, string> = {
  '0': 'abcefg',
  '1': 'cf',
  '2': 'acdeg',
  '3': 'acdfg',
  '4': 'bcdf',
  '5': 'abdfg',
  '6': 'abdefg',
  '7': 'acf',
  '8': 'abcdefg',
  '9': 'abcdfg',
}

interface MeshBuffers {
  positions: number[]
  colors: number[]
}

function world(x: number, y: number, height: number): [number, number, number] {
  return [x - FIELD_LENGTH / 2, height, -(y - FIELD_CENTER_Y)]
}

function pushTri(
  buf: MeshBuffers,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  color: readonly [number, number, number],
): void {
  buf.positions.push(...a, ...b, ...c)
  buf.colors.push(...color, ...color, ...color)
}

function pushQuadYards(
  buf: MeshBuffers,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: readonly [number, number, number],
  height = MARK_Y,
): void {
  const a = world(x0, y0, height)
  const b = world(x1, y0, height)
  const c = world(x1, y1, height)
  const d = world(x0, y1, height)
  pushTri(buf, a, b, c, color)
  pushTri(buf, a, c, d, color)
}

function pushBox(
  buf: MeshBuffers,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  color: readonly [number, number, number],
): void {
  const quads: [number, number, number][][] = [
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0],
    ],
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    [
      [x0, y0, z1],
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
    ],
    [
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ],
    [
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
      [x0, y0, z0],
    ],
  ]
  for (const quad of quads) {
    const a = quad[0]
    const b = quad[1]
    const c = quad[2]
    const d = quad[3]
    if (a == null || b == null || c == null || d == null) continue
    pushTri(buf, a, b, c, color)
    pushTri(buf, a, c, d, color)
  }
}

function addDigit(
  buf: MeshBuffers,
  originX: number,
  originY: number,
  digit: string,
  up: number,
): void {
  const width = 1.15
  const height = 2
  const t = 0.18
  const boxes: Record<string, [number, number, number, number]> = {
    a: [0, height - t, width, t],
    b: [0, height / 2, t, height / 2],
    c: [width - t, height / 2, t, height / 2],
    d: [t, height / 2 - t / 2, width - 2 * t, t],
    e: [0, 0, t, height / 2],
    f: [width - t, 0, t, height / 2],
    g: [0, 0, width, t],
  }
  const on = DIGIT_ON[digit] ?? ''
  for (const key of on) {
    const box = boxes[key]
    if (box == null) continue
    const [lx, ly, w, h] = box
    const y0 = originY + up * ly
    const y1 = originY + up * (ly + h)
    pushQuadYards(buf, originX + lx, Math.min(y0, y1), originX + lx + w, Math.max(y0, y1), WHITE)
  }
}

function addNumber(buf: MeshBuffers, lineX: number, baselineY: number, up: number): void {
  const yards = Math.round(Math.min(lineX - 10, 110 - lineX))
  const text = String(yards).padStart(2, '0')
  const width = 1.15
  const gap = 0.28
  const total = width * 2 + gap
  let x = lineX - total / 2
  for (const digit of text) {
    addDigit(buf, x, baselineY, digit, up)
    x += width + gap
  }
}

function addGoal(buf: MeshBuffers, goalX: number): void {
  const half = 7.11 / 2
  const mid = FIELD_WIDTH / 2
  const post = 0.18
  const crossH = 10 / 3
  const top = 12
  const zL = -(mid - half - FIELD_CENTER_Y)
  const zR = -(mid + half - FIELD_CENTER_Y)
  const x = goalX - FIELD_LENGTH / 2
  pushBox(buf, x - post / 2, crossH, zL - post / 2, x + post / 2, top, zL + post / 2, YELLOW)
  pushBox(buf, x - post / 2, crossH, zR - post / 2, x + post / 2, top, zR + post / 2, YELLOW)
  pushBox(
    buf,
    x - post / 2,
    crossH,
    Math.min(zL, zR),
    x + post / 2,
    crossH + post,
    Math.max(zL, zR),
    YELLOW,
  )
  const back = goalX < 60 ? goalX - 2 : goalX + 2
  const bx = back - FIELD_LENGTH / 2
  pushBox(buf, Math.min(x, bx), 0, -post / 2, Math.max(x, bx), post, post / 2, YELLOW)
  pushBox(buf, x - post / 2, 0, -post / 2, x + post / 2, crossH, post / 2, YELLOW)
}

function geometry(buf: MeshBuffers): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(buf.positions, 3))
  geo.setAttribute('color', new Float32BufferAttribute(buf.colors, 3))
  return geo
}

/** 24 mow stripes, 48 triangles, flat grass green. */
export function buildGrass(): BufferGeometry {
  const buf: MeshBuffers = { positions: [], colors: [] }
  const stripes = 24
  for (let i = 0; i < stripes; i += 1) {
    const x0 = (FIELD_LENGTH * i) / stripes
    const x1 = (FIELD_LENGTH * (i + 1)) / stripes
    pushQuadYards(buf, x0, 0, x1, FIELD_WIDTH, i % 2 === 0 ? GRASS_A : GRASS_B, 0)
  }
  return geometry(buf)
}

/** Yard lines, hashes, block numbers, boundaries, and goalposts. One merged mesh. */
export function buildFieldMarkings(config: FieldConfig): BufferGeometry {
  const buf: MeshBuffers = { positions: [], colors: [] }
  const half = YARD_LINE_W / 2
  for (let x = 10; x <= 110; x += 5) {
    pushQuadYards(buf, x - half, 0, x + half, FIELD_WIDTH, WHITE)
  }
  pushQuadYards(buf, 0, 0, BOUNDARY_W, FIELD_WIDTH, WHITE)
  pushQuadYards(buf, FIELD_LENGTH - BOUNDARY_W, 0, FIELD_LENGTH, FIELD_WIDTH, WHITE)
  pushQuadYards(buf, 0, 0, FIELD_LENGTH, BOUNDARY_W, WHITE)
  pushQuadYards(buf, 0, FIELD_WIDTH - BOUNDARY_W, FIELD_LENGTH, FIELD_WIDTH, WHITE)

  const tick = 0.55
  for (let x = 10; x <= 110; x += 1) {
    if (x % 5 === 0) continue
    pushQuadYards(buf, x - half, 0, x + half, tick, WHITE)
    pushQuadYards(buf, x - half, FIELD_WIDTH - tick, x + half, FIELD_WIDTH, WHITE)
    for (const hashY of config.hashY) {
      pushQuadYards(buf, x - half, hashY - tick / 2, x + half, hashY + tick / 2, WHITE)
    }
  }

  for (let x = 20; x <= 100; x += 10) {
    addNumber(buf, x, 5.2, 1)
    addNumber(buf, x, FIELD_WIDTH - 5.2, -1)
  }

  addGoal(buf, 10)
  addGoal(buf, 110)
  return geometry(buf)
}

export function triangleCount(geo: BufferGeometry): number {
  const index = geo.getIndex()
  if (index != null) return index.count / 3
  return (geo.getAttribute('position').count ?? 0) / 3
}
