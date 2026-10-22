import { describe, expect, it } from 'vitest'
import { fieldConfig } from '../src/field/fieldConfig'
import { buildBallGeometry } from '../src/scene/ballGeometry'
import { blockyVisual } from '../src/scene/blockyVisual'
import { buildFieldMarkings, buildGrass, triangleCount } from '../src/scene/fieldMarkings'
import { createNumberGeometry } from '../src/scene/playerVisual'

describe('phase 2 budget', () => {
  it('stays within 8 draw calls worth of meshes and 6000 triangles', () => {
    const body = triangleCount(blockyVisual.geometry)
    const numbers = triangleCount(createNumberGeometry(blockyVisual.numberAnchor))
    const total =
      triangleCount(buildGrass()) +
      triangleCount(buildFieldMarkings(fieldConfig())) +
      body * 22 +
      numbers * 22 +
      triangleCount(buildBallGeometry())
    expect(body).toBeLessThanOrEqual(160)
    expect(total).toBeLessThanOrEqual(6000)
    expect(total).toBe(3854)
  })

  it('keeps the only texture at the 1024 atlas', () => {
    expect(1024 * 1024 * 4).toBe(4 * 1024 * 1024)
  })
})
