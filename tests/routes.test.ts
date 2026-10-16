import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fieldConfig } from '../src/field/fieldConfig'
import { compilePlay } from '../src/play/compile'
import { validatePlay } from '../src/play/load'
import { buildFieldMarkings, buildGrass, triangleCount } from '../src/scene/fieldMarkings'
import { boxVisual, createNumberGeometry } from '../src/scene/playerVisual'
import {
  ROUTE_CSS_PX,
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
      triangleCount(boxVisual.geometry) * 22 +
      triangleCount(createNumberGeometry(boxVisual.numberAnchor)) * 22 +
      80
    expect(routes).toBe(180)
    expect(scene).toBeLessThanOrEqual(2000)
    expect(scene + routes).toBeLessThanOrEqual(2000)
  })
})
