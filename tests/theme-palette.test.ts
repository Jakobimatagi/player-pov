import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseCssColor, toCss, toHex } from '../src/theme/color'
import {
  FALLBACK_PALETTE,
  PALETTE_TOKENS,
  resolveThemePalette,
  type ThemePalette,
} from '../src/theme/palette'
import { useThemePalette } from '../src/theme/useScenePalette'

const CSS = readFileSync('src/index.css', 'utf8')

/** The custom properties declared in the first block matching `selector`. */
function block(selector: string): Map<string, string> {
  const start = CSS.indexOf(`${selector} {`)
  const body = CSS.slice(start, CSS.indexOf('}', start))
  const tokens = new Map<string, string>()
  for (const match of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    if (match[1] != null && match[2] != null) tokens.set(match[1], match[2].trim())
  }
  return tokens
}

/** Like the browser: light overrides dark, and var() is substituted. */
function reader(...layers: Map<string, string>[]) {
  const tokens = new Map(layers.flatMap((layer) => [...layer]))
  const read = (name: string): string =>
    (tokens.get(name) ?? '').replace(/var\((--[\w-]+)\)/g, (_, ref: string) => read(ref))
  return read
}

const dark = block(':root')
const light = block(":root[data-theme='light']")

describe('parseCssColor', () => {
  it('converts oklch to sRGB', () => {
    expect(toHex(parseCssColor('oklch(0.628 0.2577 29.23)')!)).toBe('#ff0000')
    expect(toHex(parseCssColor('oklch(1 0 0)')!)).toBe('#ffffff')
    expect(toHex(parseCssColor('oklch(0 0 0)')!)).toBe('#000000')
    // The dark theme's --background.
    expect(toHex(parseCssColor('oklch(0.165 0.03 258)')!)).toBe('#060e1b')
    expect(toHex(parseCssColor('oklch(16.5% 0.03 258deg)')!)).toBe('#060e1b')
  })

  it('keeps alpha from oklch, rgb and hex', () => {
    expect(toCss(parseCssColor('oklch(0.97 0.006 250 / 5%)')!)).toBe('rgba(242,245,249,0.05)')
    expect(toCss(parseCssColor('rgb(255 255 255 / 55%)')!)).toBe('rgba(255,255,255,0.55)')
    expect(toCss(parseCssColor('rgba(255, 255, 255, 0.55)')!)).toBe('rgba(255,255,255,0.55)')
    expect(toCss(parseCssColor('#fff')!)).toBe('#ffffff')
    expect(toCss(parseCssColor('#11223380')!)).toBe('rgba(17,34,51,0.502)')
  })

  it('rejects what it does not know', () => {
    expect(parseCssColor('')).toBeNull()
    expect(parseCssColor('#12')).toBeNull()
    expect(parseCssColor('oklch(0.5 0.1)')).toBeNull()
    expect(parseCssColor('color-mix(in srgb, red, blue)')).toBeNull()
  })
})

describe('resolveThemePalette', () => {
  it('falls back without a page (server, Node)', () => {
    expect(resolveThemePalette()).toBe(FALLBACK_PALETTE)
  })

  it('reads each colour from its token and falls back per token', () => {
    const read = (name: string) =>
      name === '--diagram-field'
        ? 'oklch(0.628 0.2577 29.23)'
        : name === '--field-turf'
          ? 'nope'
          : ''
    const palette = resolveThemePalette(read)
    expect(palette.diagram.field).toBe('#ff0000')
    expect(palette.field.turf).toBe(FALLBACK_PALETTE.field.turf)
    expect(palette.editor).toEqual(FALLBACK_PALETTE.editor)
  })

  it('has a token in src/index.css for every colour', () => {
    for (const group of Object.values(PALETTE_TOKENS)) {
      for (const token of Object.values<string>(group)) {
        expect(dark.has(token), token).toBe(true)
        expect(parseCssColor(reader(dark)(token)), token).not.toBeNull()
      }
    }
  })

  it('keeps the fallback palette equal to the dark theme tokens', () => {
    expect(resolveThemePalette(reader(dark))).toEqual(FALLBACK_PALETTE)
  })

  it('resolves the light theme from its own tokens', () => {
    const palette: ThemePalette = resolveThemePalette(reader(dark, light))
    for (const token of light.keys())
      expect(parseCssColor(reader(dark, light)(token))).not.toBeNull()
    expect(palette.diagram.field).toBe('#f8fafd')
    expect(palette.diagram.text).toBe('#0c1626')
    expect(palette.diagram.grid).toBe('rgba(12,22,38,0.05)')
    expect(palette.field).toEqual(FALLBACK_PALETTE.field)
  })

  it('serves the fallback palette to server-rendered views', () => {
    function Probe() {
      return createElement('i', null, useThemePalette().diagram.field)
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe(
      `<i>${FALLBACK_PALETTE.diagram.field}</i>`,
    )
  })
})
