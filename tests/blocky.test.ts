import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blockyVisual } from '../src/scene/blockyVisual'

describe('blocky players', () => {
  it('stays within 160 triangles and shades every part', () => {
    const geometry = blockyVisual.geometry
    const position = geometry.getAttribute('position')
    const parts = geometry.getAttribute('aPart')
    expect(position.count / 3).toBeLessThanOrEqual(160)
    expect(position.count / 3).toBeGreaterThan(12)
    const seen = new Set<number>()
    for (let i = 0; i < parts.count; i += 1) seen.add(parts.getX(i) ?? -1)
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })

  it('winds every box outward so no face is back-face culled', () => {
    const position = blockyVisual.geometry.getAttribute('position')
    const vertsPerBox = 36
    expect(position.count % vertsPerBox).toBe(0)
    const key = (i: number) => `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`
    for (let start = 0; start < position.count; start += vertsPerBox) {
      // Consistent winding: every directed edge is matched by its reverse.
      const edges = new Map<string, number>()
      let volume = 0
      for (let t = start; t < start + vertsPerBox; t += 3) {
        const ids = [t, t + 1, t + 2]
        for (let k = 0; k < 3; k += 1) {
          const a = key(ids[k] ?? 0)
          const b = key(ids[(k + 1) % 3] ?? 0)
          edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1)
        }
        const [ax, ay, az] = [position.getX(t), position.getY(t), position.getZ(t)]
        const [bx, by, bz] = [position.getX(t + 1), position.getY(t + 1), position.getZ(t + 1)]
        const [cx, cy, cz] = [position.getX(t + 2), position.getY(t + 2), position.getZ(t + 2)]
        volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
      }
      for (const [edge, count] of edges) {
        const [a, b] = edge.split('>')
        expect(edges.get(`${b}>${a}`), `box at vertex ${start}, edge ${edge}`).toBe(count)
      }
      // Outward, not inside-out: positive signed volume.
      expect(volume, `box at vertex ${start}`).toBeGreaterThan(0)
    }
  })

  it('puts the jersey number on the chest anchor', () => {
    expect(blockyVisual.numberAnchor.chestHeight).toBeGreaterThan(1)
    expect(blockyVisual.numberAnchor.frontOffset).toBeGreaterThan(0)
  })

  it('draws the facemask in the DOM and lets clicks through', () => {
    const overlay = readFileSync('src/ui/FacemaskOverlay.tsx', 'utf8')
    const css = readFileSync('src/index.css', 'utf8')
    expect(overlay).toMatch(/data-testid="facemask"/)
    expect(css).toMatch(/\.facemask[\s\S]*pointer-events:\s*none/)
    expect(css).toMatch(/scaleX\(0\.6\)/)
  })
})
