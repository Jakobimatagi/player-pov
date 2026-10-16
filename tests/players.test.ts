import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fieldConfig } from '../src/field/fieldConfig'
import { buildFieldMarkings, buildGrass, triangleCount } from '../src/scene/fieldMarkings'
import { TEAM_COLOR, boxVisual, createNumberGeometry } from '../src/scene/playerVisual'

describe('box players', () => {
  it('is one 12-triangle box with a darker front face', () => {
    const geometry = boxVisual.geometry
    const index = geometry.getIndex()
    expect(index).not.toBeNull()
    expect((index?.count ?? 0) / 3).toBe(12)
    const position = geometry.getAttribute('position')
    const color = geometry.getAttribute('color')
    let front = 0
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i) ?? 0
      const shade = color.getX(i) ?? 0
      if (x > 0.2) {
        front += 1
        expect(shade).toBeCloseTo(0.55, 2)
      } else {
        expect(shade).toBeCloseTo(1, 2)
      }
    }
    expect(front).toBeGreaterThan(0)
  })

  it('uses the locked team colors', () => {
    expect(TEAM_COLOR.offense).toBe('#c8102e')
    expect(TEAM_COLOR.defense).toBe('#f2f2f2')
    const offense = boxVisual.createMaterial('offense') as unknown as {
      color: { getHexString(): string }
    }
    const defense = boxVisual.createMaterial('defense') as unknown as {
      color: { getHexString(): string }
    }
    expect(offense.color.getHexString()).toBe('c8102e')
    expect(defense.color.getHexString()).toBe('f2f2f2')
  })

  it('lets Players swap a visual without importing body geometry', () => {
    const source = readFileSync('src/scene/Players.tsx', 'utf8')
    expect(source).not.toMatch(/BoxGeometry|MeshLambertMaterial|MeshBasicMaterial/)
    expect(source).toMatch(/PlayerVisual/)
    expect(source).toMatch(/visual = boxVisual/)
  })

  it('faces jersey numbers outward and samples one atlas cell', () => {
    const geo = createNumberGeometry(boxVisual.numberAnchor)
    const position = geo.getAttribute('position')
    const faces: { x: number; z: number; nx: number; nz: number }[] = []
    for (let i = 0; i < position.count; i += 3) {
      const ax = position.getX(i) ?? 0
      const ay = position.getY(i) ?? 0
      const az = position.getZ(i) ?? 0
      const bx = position.getX(i + 1) ?? 0
      const by = position.getY(i + 1) ?? 0
      const bz = position.getZ(i + 1) ?? 0
      const cx = position.getX(i + 2) ?? 0
      const cy = position.getY(i + 2) ?? 0
      const cz = position.getZ(i + 2) ?? 0
      const ux = bx - ax
      const uy = by - ay
      const uz = bz - az
      const vx = cx - ax
      const vy = cy - ay
      const vz = cz - az
      faces.push({
        x: (ax + bx + cx) / 3,
        z: (az + bz + cz) / 3,
        nx: uy * vz - uz * vy,
        nz: ux * vy - uy * vx,
      })
    }
    const front = faces.filter((face) => face.x > 0.2)
    const back = faces.filter((face) => face.x < -0.2)
    const plusZ = faces.filter((face) => face.z > 0.3)
    const minusZ = faces.filter((face) => face.z < -0.3)
    expect(front.length).toBeGreaterThan(0)
    expect(back.length).toBeGreaterThan(0)
    expect(plusZ.length).toBeGreaterThan(0)
    expect(minusZ.length).toBeGreaterThan(0)
    for (const face of front) expect(face.nx).toBeGreaterThan(0)
    for (const face of back) expect(face.nx).toBeLessThan(0)
    for (const face of plusZ) expect(face.nz).toBeGreaterThan(0)
    for (const face of minusZ) expect(face.nz).toBeLessThan(0)

    const shader = readFileSync('src/scene/jerseyAtlas.ts', 'utf8')
    expect(shader).toContain('vMapUv = vec2((cellCol + uv.x) / 10.0')
    expect(shader).not.toContain('vUv = vec2((cellCol')
  })

  it('keeps the full scene within 2000 triangles and 10 meshes', () => {
    const players = readFileSync('src/scene/Players.tsx', 'utf8')
    const pickMeshes = players.match(/layers\.set\(1\)/g)?.length ?? 0
    const boxTris = triangleCount(boxVisual.geometry)
    const tris =
      triangleCount(buildGrass()) +
      triangleCount(buildFieldMarkings(fieldConfig())) +
      boxTris * 22 +
      triangleCount(createNumberGeometry(boxVisual.numberAnchor)) * 22 +
      80
    expect(pickMeshes).toBe(2)
    expect(tris).toBeLessThanOrEqual(2000)
    const tags = (source: string) => source.match(/<(mesh|instancedMesh)\b/g)?.length ?? 0
    const meshes = tags(readFileSync('src/scene/Field.tsx', 'utf8')) + tags(players)
    expect(meshes).toBeLessThanOrEqual(10)
    expect(meshes).toBeGreaterThan(pickMeshes)
  })
})
