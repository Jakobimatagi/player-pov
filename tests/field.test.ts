import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIELD_CENTER_Y, yardsToWorld } from '../src/play/coords'
import { HASH_Y, fieldConfig, hashRuleFromSearch } from '../src/field/fieldConfig'
import { buildFieldMarkings, buildGrass, triangleCount } from '../src/scene/fieldMarkings'

describe('field config', () => {
  it('uses NFHS hashes by default and NCAA from the query', () => {
    expect(fieldConfig().hashY).toEqual(HASH_Y.NFHS)
    expect(HASH_Y.NFHS).toEqual([17.78, 35.56])
    expect(HASH_Y.NCAA).toEqual([20, 33.33])
    expect(HASH_Y.NFL).toEqual([23.583, 29.75])
    expect(hashRuleFromSearch('?hash=ncaa')).toBe('NCAA')
    expect(hashRuleFromSearch('?hash=NFL')).toBe('NFL')
    expect(hashRuleFromSearch('')).toBe('NFHS')
  })
})

describe('field geometry', () => {
  it('keeps grass at 48 triangles and markings at or under 2000', () => {
    const grass = triangleCount(buildGrass())
    const nfhs = triangleCount(buildFieldMarkings(fieldConfig('NFHS')))
    const ncaa = triangleCount(buildFieldMarkings(fieldConfig('NCAA')))
    expect(grass).toBe(48)
    expect(nfhs).toBeLessThanOrEqual(2000)
    expect(nfhs).toBeGreaterThan(100)
    expect(ncaa).toBe(nfhs)
  })

  it('keeps the whole field scene at or under 2000 triangles', () => {
    const total =
      triangleCount(buildGrass()) + triangleCount(buildFieldMarkings(fieldConfig('NFHS')))
    expect(total).toBeLessThanOrEqual(2000)
    expect(total).toBeGreaterThan(48)
  })

  it('moves hash ticks when the rule changes', () => {
    const zOf = (rule: 'NFHS' | 'NCAA') => {
      const geo = buildFieldMarkings(fieldConfig(rule))
      const pos = geo.getAttribute('position')
      const target = yardsToWorld(35, HASH_Y[rule][0], 0.03, { x: 0, y: 0, z: 0 }).z
      let near = 0
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.abs((pos.getZ(i) ?? 0) - target) < 0.4) near += 1
      }
      return near
    }
    expect(zOf('NFHS')).toBeGreaterThan(10)
    expect(zOf('NCAA')).toBeGreaterThan(10)
    const nfhsZ = yardsToWorld(35, HASH_Y.NFHS[0], 0, { x: 0, y: 0, z: 0 }).z
    const ncaaZ = yardsToWorld(35, HASH_Y.NCAA[0], 0, { x: 0, y: 0, z: 0 }).z
    expect(Math.abs(nfhsZ - ncaaZ)).toBeGreaterThan(1)
  })

  it('bakes goalpost face shade and keeps the scene unlit', () => {
    const geo = buildFieldMarkings(fieldConfig('NFHS'))
    const color = geo.getAttribute('color')
    const yellow = new Set<string>()
    for (let i = 0; i < color.count; i += 1) {
      const r = color.getX(i) ?? 0
      const g = color.getY(i) ?? 0
      if (r > 0.4 && g > 0.3 && (color.getZ(i) ?? 0) < 0.2) yellow.add(r.toFixed(3))
    }
    expect(yellow.size).toBeGreaterThan(1)
    const field = readFileSync('src/scene/Field.tsx', 'utf8')
    expect(field).not.toMatch(/Light/)
    const ball = readFileSync('src/scene/Ball.tsx', 'utf8')
    expect(ball).not.toMatch(/Lambert/)
  })

  it('puts the ball spot on the 25 at midfield', () => {
    const spot = yardsToWorld(35, FIELD_CENTER_Y, 0.45, { x: 0, y: 0, z: 0 })
    expect(spot.x).toBeCloseTo(-25, 5)
    expect(spot.z).toBeCloseTo(0, 5)
  })
})
