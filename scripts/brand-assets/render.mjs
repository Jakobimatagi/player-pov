// Renders the Scheme HQ icon set and share image into public/. See README.md in this folder.
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/brand-assets/render.mjs
//
// Needs Node 22.18+ (it imports src/lib/brand.ts directly) and Google Chrome.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32, deflateSync, inflateSync } from 'node:zlib'
import { BRAND } from '../../src/lib/brand.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const pub = join(root, 'public')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const chrome =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const ORANGE = '#ff7a1f'
const INK = '#1a0d02'

/**
 * The mark's drawing on a 32-unit grid: the player (O), a route that steps across and up, and the
 * arrow. Thick strokes and a flat middle so it still reads at 16px. Keep BrandMark in
 * src/components/brand/Wordmark.tsx in step with this.
 */
const GLYPH =
  `<g fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(-0.5 -1)">` +
  '<circle cx="9" cy="23" r="3.6"/>' +
  '<path d="M9 19.4C9 16.5 10.5 16 13 16H19C21.5 16 23 15.5 23 12.5V7.5"/>' +
  '<path d="M18.5 12L23 7.5 27.5 12"/>' +
  '</g>'

/** The favicon: the glyph on an orange rounded square, transparent corners. */
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${ORANGE}"/>${GLYPH}</svg>`

/** Full-bleed orange square with the glyph inset by `pad` units on each side (no transparency). */
const solidSvg = (pad) => {
  const s = 32 + pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${s} ${s}"><rect x="${-pad}" y="${-pad}" width="${s}" height="${s}" fill="${ORANGE}"/>${GLYPH}</svg>`
}

const svgUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const browser = await chromium.launch({ executablePath: chrome })
// One fixed viewport big enough for every asset; each render is clipped to its size.
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1200, height: 630 } })

async function renderSvg(svg, size) {
  await page.setContent(
    `<body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="${svgUrl(svg)}"></body>`,
  )
  await page.locator('img').evaluate((img) => img.decode())
  return optimise(
    await page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    }),
  )
}

/**
 * Re-deflates a PNG's image data at maximum compression (Chrome favours speed). Lossless and
 * needs no extra tools; the pixels and filters are untouched.
 */
function optimise(png) {
  const chunks = []
  const idat = []
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const data = png.subarray(at + 8, at + 8 + len)
    if (type === 'IDAT') idat.push(data)
    else chunks.push({ type, data })
    at += 12 + len
  }
  const pixels = deflateSync(inflateSync(Buffer.concat(idat)), { level: 9, memLevel: 9 })
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
    return Buffer.concat([head, data, crc])
  }
  const out = []
  for (const c of chunks) {
    if (c.type === 'IEND') out.push(chunk('IDAT', pixels))
    out.push(chunk(c.type, c.data))
  }
  const result = Buffer.concat([png.subarray(0, 8), ...out])
  return result.length < png.length ? result : png
}

/** An .ico holding PNG images (supported by every browser that still asks for one). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + i * 16
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt16LE(1, e + 4) // colour planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

const write = (rel, data) => {
  writeFileSync(join(pub, rel), data)
  console.log(`wrote public/${rel} (${data.length} bytes)`)
}

write('favicon.svg', markSvg + '\n')
const fav16 = await renderSvg(markSvg, 16)
const fav32 = await renderSvg(markSvg, 32)
write('favicon-32.png', fav32)
write(
  'favicon.ico',
  ico([
    { size: 16, png: fav16 },
    { size: 32, png: fav32 },
  ]),
)
write('apple-touch-icon.png', await renderSvg(solidSvg(4), 180))
write('icon-192.png', await renderSvg(markSvg, 192))
write('icon-512.png', await renderSvg(markSvg, 512))
// Maskable: the glyph's corners stay inside the centre circle (40% radius) Android crops to.
write('icon-maskable-512.png', await renderSvg(solidSvg(7.7), 512))

// Share image.
await page.goto(pathToFileURL(join(here, 'og.html')).href)
await page.evaluate((brand) => {
  const set = (key, html) => {
    const el = document.querySelector(`[data-brand="${key}"]`)
    if (el) el.innerHTML = html
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  set('lead', esc(brand.wordmark.lead))
  set('accent', esc(brand.wordmark.accent))
  set(
    'tagline',
    brand.tagline
      .split(/(?<=\.)\s+/)
      .map((line) => `<span>${esc(line)}</span>`)
      .join(''),
  )
  set('host', esc(new URL(brand.url).host.replace(/^www\./, '')))
}, BRAND)
await page.evaluate(() => document.fonts.ready)
await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())))
write(
  'landing/og.png',
  optimise(await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } })),
)

// A pixel-zoomed look at the 16 and 32px favicons on light and dark tabs, for checking legibility.
const sheetDir = process.env.BRAND_PREVIEW_DIR ?? join(tmpdir(), 'scheme-hq-brand')
mkdirSync(sheetDir, { recursive: true })
const tiles = [fav16, fav32]
  .flatMap((png) =>
    ['#ffffff', '#dee1e6', '#202124', '#35363a'].map(
      (bg) =>
        `<div style="background:${bg};padding:32px"><img style="display:block;width:128px;image-rendering:pixelated" src="data:image/png;base64,${png.toString('base64')}"></div>`,
    ),
  )
  .join('')
await page.setContent(
  `<body style="margin:0;display:grid;grid-template-columns:repeat(4,auto);width:max-content">${tiles}</body>`,
)
const sheet = join(sheetDir, 'favicon-zoom.png')
await page.screenshot({ path: sheet, fullPage: true })
console.log(`preview: ${sheet}`)

await browser.close()
