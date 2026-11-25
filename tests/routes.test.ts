import { readFileSync } from 'node:fs'
import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { fieldConfig } from '../src/field/fieldConfig'
import { compilePlay } from '../src/play/compile'
import { validatePlay } from '../src/play/load'
import { MAX_WAYPOINTS } from '../src/play/schema'
import type { PlayFile, Waypoint } from '../src/play/types'
import { buildBallGeometry } from '../src/scene/ballGeometry'
import { TOKEN_COLORS } from '../src/theme/playerColors'
import { blockyVisual } from '../src/scene/blockyVisual'
import { buildFieldMarkings, buildGrass, triangleCount } from '../src/scene/fieldMarkings'
import { createNumberGeometry } from '../src/scene/playerVisual'
import {
  ROUTE_CSS_PX,
  ROUTE_SEGMENT_CAP,
  buildRouteRibbon,
  createRouteMaterial,
  sizeRouteMaterial,
} from '../src/scene/routeRibbon'

describe('route ribbons', () => {
  it('builds two triangles per waypoint segment in one geometry', () => {
    const geometry = buildRouteRibbon({
      count: 2,
      wpStart: new Uint16Array([0, 3, 5]),
      wpX: new Float32Array([0, 10, 20, 0, 5]),
      wpY: new Float32Array([0, 0, 5, 1, 2]),
    })
    expect(triangleCount(geometry)).toBe(6)
    expect(geometry.getAttribute('aStart')).toBeDefined()
    expect(geometry.getAttribute('aCorner')).toBeDefined()
  })

  it("draws each player's route in his card colour, and the rest in the theme colour", () => {
    const geometry = buildRouteRibbon({
      count: 3,
      wpStart: new Uint16Array([0, 3, 5, 7]),
      wpX: new Float32Array([0, 10, 20, 0, 5, 0, 5]),
      wpY: new Float32Array([0, 0, 5, 1, 2, 3, 4]),
      colors: ['red', null, 'green'],
    })
    expect(triangleCount(geometry)).toBe(8)
    const color = geometry.getAttribute('aColor')
    const at = (v: number) => [color.getX(v), color.getY(v), color.getZ(v), color.getW(v)]
    const red = new Color(TOKEN_COLORS.red)
    const green = new Color(TOKEN_COLORS.green)
    // Two chords (8 vertices) for the red player, one for the uncoloured one, one for green.
    for (let v = 0; v < 8; v += 1) {
      const [r, g, b, a] = at(v)
      expect([r, g, b].map((n) => n!.toFixed(4))).toEqual(red.toArray().map((n) => n.toFixed(4)))
      expect(a).toBe(1)
    }
    for (let v = 8; v < 12; v += 1) expect(at(v)[3]).toBe(0)
    for (let v = 12; v < 16; v += 1) {
      const [r, g, b, a] = at(v)
      expect([r, g, b].map((n) => n!.toFixed(4))).toEqual(green.toArray().map((n) => n.toFixed(4)))
      expect(a).toBe(1)
    }
  })

  it('draws a compiled play with no card colours entirely in the theme colour', () => {
    const text = readFileSync('public/plays/trips-right-vs-cover2.json', 'utf8')
    const parsed = validatePlay(JSON.parse(text) as unknown)
    if (!parsed.ok) throw new Error('sample play is invalid')
    const play = compilePlay(parsed.play)
    expect(play.colors.every((c) => c == null)).toBe(true)
    const color = buildRouteRibbon(play).getAttribute('aColor')
    expect(color.count).toBeGreaterThan(0)
    for (let v = 0; v < color.count; v += 1) expect(color.getW(v)).toBe(0)

    const coloured = structuredClone(parsed.play)
    for (const p of coloured.players) if (p.team === 'offense') p.color = 'blue'
    const ribbon = buildRouteRibbon(compilePlay(coloured))
    expect(triangleCount(ribbon)).toBe(triangleCount(buildRouteRibbon(play)))
    const tinted = ribbon.getAttribute('aColor')
    let cased = 0
    for (let v = 0; v < tinted.count; v += 1) cased += tinted.getW(v)
    expect(cased).toBeGreaterThan(0)
    expect(cased).toBeLessThan(tinted.count)
  })

  it('sizes an unlit screen-space material on resize and stays inside the triangle budget', () => {
    const material = createRouteMaterial()
    expect(material.toneMapped).toBe(false)
    expect(material.lights).toBe(false)
    expect(material.depthWrite).toBe(true)
    expect(material.fragmentShader).toContain('colorspace_fragment')
    sizeRouteMaterial(material, 360, 800, 2)
    expect(material.uniforms['uWidth']?.value).toBe(ROUTE_CSS_PX * 2)
    const resolution = material.uniforms['uResolution']?.value as { x: number; y: number }
    expect(resolution.x).toBe(720)
    expect(resolution.y).toBe(1600)

    const source = readFileSync('src/scene/RouteLines.tsx', 'utf8')
    expect(source.match(/<mesh\b/g)?.length).toBe(1)
    expect(source).not.toMatch(/lineSegments|LineBasicMaterial|MeshLambertMaterial/)
    expect(source).toContain('castShadow={false}')
    expect(source).toContain('sizeRouteMaterial')

    const text = readFileSync('public/plays/trips-right-vs-cover2.json', 'utf8')
    const parsed = validatePlay(JSON.parse(text) as unknown)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const routes = triangleCount(buildRouteRibbon(compilePlay(parsed.play)))
    const scene =
      triangleCount(buildGrass()) +
      triangleCount(buildFieldMarkings(fieldConfig())) +
      triangleCount(blockyVisual.geometry) * 22 +
      triangleCount(createNumberGeometry(blockyVisual.numberAnchor)) * 22 +
      triangleCount(buildBallGeometry())
    expect(routes).toBe(180)
    expect(scene).toBeLessThanOrEqual(6000)
    expect(scene + routes).toBeLessThanOrEqual(6000)
    expect(scene + ROUTE_SEGMENT_CAP * 2).toBeLessThanOrEqual(6000)
  })

  it('keeps a schema-valid play at the waypoint cap within 6000 triangles', () => {
    const sample = JSON.parse(
      readFileSync('public/plays/trips-right-vs-cover2.json', 'utf8'),
    ) as PlayFile
    for (const player of sample.players) {
      const wps = player.waypoints
      while (wps.length < MAX_WAYPOINTS) {
        const prev = wps[wps.length - 2]
        const last = wps[wps.length - 1]
        if (prev == null || last == null) break
        const mid: Waypoint = {
          t: (prev.t + last.t) / 2,
          x: (prev.x + last.x) / 2,
          y: (prev.y + last.y) / 2,
        }
        wps.splice(wps.length - 1, 0, mid)
      }
    }
    const atCap = validatePlay(sample)
    expect(atCap.ok).toBe(true)
    if (!atCap.ok) return
    const routes = triangleCount(buildRouteRibbon(compilePlay(atCap.play)))
    const scene =
      triangleCount(buildGrass()) +
      triangleCount(buildFieldMarkings(fieldConfig())) +
      triangleCount(blockyVisual.geometry) * 22 +
      triangleCount(createNumberGeometry(blockyVisual.numberAnchor)) * 22 +
      triangleCount(buildBallGeometry())
    const rawChords = 22 * (MAX_WAYPOINTS - 1)
    expect(rawChords).toBeGreaterThan(ROUTE_SEGMENT_CAP)
    expect(routes).toBeLessThanOrEqual(ROUTE_SEGMENT_CAP * 2)
    expect(routes).toBeLessThan(rawChords * 2)
    expect(scene + routes).toBeLessThanOrEqual(6000)

    const over = structuredClone(sample)
    const first = over.players[0]
    if (first == null) throw new Error('missing player')
    const prev = first.waypoints[first.waypoints.length - 2]
    const tail = first.waypoints[first.waypoints.length - 1]
    if (prev == null || tail == null) throw new Error('missing waypoint')
    first.waypoints.splice(first.waypoints.length - 1, 0, {
      t: (prev.t + tail.t) / 2,
      x: (prev.x + tail.x) / 2,
      y: (prev.y + tail.y) / 2,
    })
    const rejected = validatePlay(over)
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.errors.some((error) => error.path.includes('waypoints'))).toBe(true)
    }

    const dense = buildRouteRibbon({
      count: 1,
      wpStart: new Uint16Array([0, 400]),
      wpX: new Float32Array(400),
      wpY: new Float32Array(400),
    })
    expect(triangleCount(dense)).toBeLessThanOrEqual(ROUTE_SEGMENT_CAP * 2)

    const json = readFileSync('schema/play.schema.json', 'utf8')
    expect(json).toContain(`"maxItems": ${MAX_WAYPOINTS}`)
  })
})
