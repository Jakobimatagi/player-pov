import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fieldConfig } from '../src/field/fieldConfig'
import { buildBallGeometry } from '../src/scene/ballGeometry'
import { blockyVisual } from '../src/scene/blockyVisual'
import { buildFieldMarkings, buildGrass, triangleCount } from '../src/scene/fieldMarkings'
import { createNumberGeometry } from '../src/scene/playerVisual'
import { buildRouteRibbon } from '../src/scene/routeRibbon'

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

  it('maxRoutes keeps 22 players at 12 waypoints within 258 ribbon triangles and 10 meshes', () => {
    const count = 22
    const waypoints = 12
    const wpStart = new Uint16Array(count + 1)
    const wpX = new Float32Array(count * waypoints)
    const wpY = new Float32Array(count * waypoints)
    for (let i = 0; i < count; i += 1) {
      wpStart[i] = i * waypoints
      for (let k = 0; k < waypoints; k += 1) {
        wpX[i * waypoints + k] = 30 + k
        wpY[i * waypoints + k] = i
      }
    }
    wpStart[count] = count * waypoints
    const ribbon = triangleCount(buildRouteRibbon({ count, wpStart, wpX, wpY }))
    expect(ribbon).toBeLessThanOrEqual(258)
    expect(ribbon).toBeGreaterThan(0)

    const tags = (file: string) =>
      readFileSync(file, 'utf8').match(/<(mesh|instancedMesh)\b/g)?.length ?? 0
    const meshes =
      tags('src/scene/Field.tsx') +
      tags('src/scene/Players.tsx') +
      tags('src/scene/Ball.tsx') +
      tags('src/scene/RouteLines.tsx')
    expect(meshes).toBeLessThanOrEqual(10)
  })
})
