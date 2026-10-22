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
