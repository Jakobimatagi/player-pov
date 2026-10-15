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

  it('keeps the full scene within 2000 triangles and 10 meshes', () => {
    const tris =
      triangleCount(buildGrass()) +
      triangleCount(buildFieldMarkings(fieldConfig())) +
      triangleCount(boxVisual.geometry) * 2 +
      triangleCount(createNumberGeometry(boxVisual.numberAnchor))
    expect(tris).toBeLessThanOrEqual(2000)
    const tags = (source: string) => source.match(/<(mesh|instancedMesh)\b/g)?.length ?? 0
    const meshes =
      tags(readFileSync('src/scene/Field.tsx', 'utf8')) +
      tags(readFileSync('src/scene/Players.tsx', 'utf8'))
    expect(meshes).toBeLessThanOrEqual(10)
    expect(meshes).toBeGreaterThan(0)
  })
})
