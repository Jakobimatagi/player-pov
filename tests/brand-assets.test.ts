import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { webManifest } from '@/components/brand/manifest'
import { BRAND } from '@/lib/brand'

const read = (rel: string) => readFileSync(rel)

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('web app manifest', () => {
  const manifest = webManifest()

  it('names the app and uses the theme colour from BRAND', () => {
    expect(manifest.name).toBe('Scheme HQ')
    expect(manifest.short_name).toBe('Scheme HQ')
    expect(manifest.description).toBe(BRAND.description)
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toBe(BRAND.themeColor)
    expect(manifest.theme_color).toBe(BRAND.themeColor)
  })

  it('lists icons that exist at the size they claim', () => {
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(read(join('public', icon.src))), icon.src).toEqual({ width: w, height: h })
    }
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })
})

describe('icon files', () => {
  it('has a 32px PNG favicon and a 180px Apple touch icon', () => {
    expect(pngSize(read('public/favicon-32.png'))).toEqual({ width: 32, height: 32 })
    expect(pngSize(read('public/apple-touch-icon.png'))).toEqual({ width: 180, height: 180 })
  })

  it('packs 16 and 32px images into favicon.ico', () => {
    const ico = read('public/favicon.ico')
    expect(ico.readUInt16LE(2)).toBe(1) // icon type
    expect(ico.readUInt16LE(4)).toBe(2)
    expect([ico.readUInt8(6), ico.readUInt8(6 + 16)]).toEqual([16, 32])
  })

  it('has a 1200x630 share image', () => {
    expect(pngSize(read('public/landing/og.png'))).toEqual({ width: 1200, height: 630 })
  })

  it('keeps BrandMark and favicon.svg the same drawing', () => {
    const svg = read('public/favicon.svg').toString()
    const tsx = read('src/components/brand/Wordmark.tsx').toString()
    const paths = (s: string) => [...s.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])
    expect(paths(svg).length).toBeGreaterThan(0)
    expect(paths(tsx)).toEqual(paths(svg))
  })
})
