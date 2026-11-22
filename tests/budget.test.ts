import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileChart } from '../src/editor/compileAdapter'
import { fieldConfig } from '../src/field/fieldConfig'
import { COVER_2_LOOK } from '../src/play/cover2Look'
import { MAX_WAYPOINTS } from '../src/play/schema'
import type { LookSource, PlaySource } from '../src/play/sourceTypes'
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
    const fieldPlayersBall =
      triangleCount(buildGrass()) +
      triangleCount(buildFieldMarkings(fieldConfig())) +
      triangleCount(blockyVisual.geometry) * count +
      triangleCount(createNumberGeometry(blockyVisual.numberAnchor)) * count +
      triangleCount(buildBallGeometry())
    expect(ribbon).toBeLessThanOrEqual(258)
    expect(ribbon).toBeGreaterThan(0)
    expect(fieldPlayersBall + ribbon).toBeLessThanOrEqual(6000)

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

describe('scout look budget', () => {
  it('a play and a look both charted at the waypoint cap compile within the budget', () => {
    const source = JSON.parse(
      readFileSync('fixtures/trips-flood.source.json', 'utf8'),
    ) as PlaySource
    // 11 legs of 1 s each: the snap spot plus 11 waypoints is the 12-waypoint cap.
    const legs = (sign: 1 | -1) =>
      Array.from({ length: MAX_WAYPOINTS - 1 }, (_, k) => ({
        to: { dx: sign * 0.8, dy: k % 2 === 0 ? 1 : -1 },
        dur: 1,
      }))
    const end = MAX_WAYPOINTS - 1
    const play: PlaySource = {
      ...source,
      duration: end,
      players: source.players.map((p) => ({ ...p, legs: legs(1) })),
      ball: { ...source.ball, segments: [{ kind: 'carried', t0: 0, t1: end, carrier: 'qb' }] },
    }
    const look: LookSource = {
      ...COVER_2_LOOK,
      players: COVER_2_LOOK.players.map((p) => ({ ...p, legs: legs(-1) })),
    }
    const chart = compileChart(play, look)
    expect(chart.errors).toEqual([])
    const compiled = chart.compiled
    expect(compiled?.count).toBe(22)
    if (compiled == null) return
    for (let i = 0; i < compiled.count; i += 1) {
      expect((compiled.wpStart[i + 1] ?? 0) - (compiled.wpStart[i] ?? 0)).toBe(MAX_WAYPOINTS)
    }
    const ribbon = triangleCount(buildRouteRibbon(compiled))
    const scene =
      triangleCount(buildGrass()) +
      triangleCount(buildFieldMarkings(fieldConfig())) +
      triangleCount(blockyVisual.geometry) * compiled.count +
      triangleCount(createNumberGeometry(blockyVisual.numberAnchor)) * compiled.count +
      triangleCount(buildBallGeometry())
    expect(ribbon).toBeLessThanOrEqual(258)
    expect(scene + ribbon).toBeLessThanOrEqual(6000)

    // One more leg is over the cap: it is reported, never drawn.
    const over: LookSource = {
      ...look,
      players: look.players.map((p, i) =>
        i === 0 ? { ...p, legs: [...p.legs, { to: { dx: 1, dy: 0 }, dur: 1 }] } : p,
      ),
    }
    expect(compileChart({ ...play, duration: MAX_WAYPOINTS }, over).compiled).toBeNull()
  })
})
