/**
 * CSS colours as numbers, for the canvas and WebGL views that cannot read CSS variables.
 * Parsing is pure so it runs in Node; `resolveCssColor` adds a browser fallback for syntax
 * the parser does not know.
 */

/** sRGB channels 0–255 (not rounded) and alpha 0–1. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** A number or percentage; `scale` is what 100% means. `none` reads as 0. */
function component(raw: string | undefined, scale: number): number | null {
  if (raw == null) return null
  if (raw === 'none') return 0
  const percent = raw.endsWith('%')
  const value = Number.parseFloat(percent ? raw.slice(0, -1) : raw)
  if (!Number.isFinite(value)) return null
  return percent ? (value / 100) * scale : value
}

function alpha(raw: string | undefined): number | null {
  if (raw == null) return 1
  const value = component(raw, 1)
  return value == null ? null : clamp(value, 0, 1)
}

/** The arguments of `name(...)`, split on spaces, commas and the alpha slash. */
function args(css: string, names: readonly string[]): { parts: string[]; alpha?: string } | null {
  const match = /^([a-z]+)\((.*)\)$/i.exec(css)
  const name = match?.[1]?.toLowerCase()
  const body = match?.[2]
  if (name == null || body == null || !names.includes(name)) return null
  const [main = '', slash] = body.split('/')
  const parts = main
    .trim()
    .split(/[\s,]+/)
    .filter((part) => part.length > 0)
  if (slash != null) return { parts, alpha: slash.trim() }
  // Legacy rgba(r, g, b, a).
  if (parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] }
  return { parts }
}

const toGamma = (linear: number) =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055

/** OKLCH to sRGB 0–255, clipped to the sRGB gamut. */
export function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s_ = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3)
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  const [r = 0, g = 0, bl = 0] = linear.map((v) => clamp(toGamma(v), 0, 1) * 255)
  return [r, g, bl]
}

/** Hex, rgb()/rgba(), oklch() and `transparent`. Anything else is null. */
export function parseCssColor(input: string): Rgba | null {
  const css = input.trim().toLowerCase()
  if (css === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (css.startsWith('#')) {
    const digits = css.slice(1)
    if (!/^[0-9a-f]+$/.test(digits) || ![3, 4, 6, 8].includes(digits.length)) return null
    const full =
      digits.length <= 4
        ? digits
            .split('')
            .map((d) => d + d)
            .join('')
        : digits
    const byte = (i: number) => Number.parseInt(full.slice(i, i + 2), 16)
    return { r: byte(0), g: byte(2), b: byte(4), a: full.length === 8 ? byte(6) / 255 : 1 }
  }
  const rgb = args(css, ['rgb', 'rgba'])
  if (rgb != null) {
    const [r, g, b] = rgb.parts.map((part) => component(part, 255))
    const a = alpha(rgb.alpha)
    if (rgb.parts.length !== 3 || r == null || g == null || b == null || a == null) return null
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a }
  }
  const lch = args(css, ['oklch'])
  if (lch != null) {
    const l = component(lch.parts[0], 1)
    const c = component(lch.parts[1], 0.4)
    const h = component(lch.parts[2]?.replace(/deg$/, ''), 1)
    const a = alpha(lch.alpha)
    if (lch.parts.length !== 3 || l == null || c == null || h == null || a == null) return null
    const [r, g, b] = oklchToRgb(clamp(l, 0, 1), Math.max(0, c), h)
    return { r, g, b, a }
  }
  return null
}

let probe: CanvasRenderingContext2D | null | undefined

/** Any colour the browser knows, read back from a 1×1 canvas. Opaque only. */
function probeColor(css: string): Rgba | null {
  if (typeof document === 'undefined') return null
  if (probe === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (probe == null) return null
  // A colour the browser rejects leaves fillStyle at the sentinel.
  const sentinel = '#ff00fe' // raw colour: probe sentinel, never drawn
  probe.fillStyle = sentinel
  probe.fillStyle = css
  if (probe.fillStyle === sentinel) return null
  probe.clearRect(0, 0, 1, 1)
  probe.fillRect(0, 0, 1, 1)
  const data = probe.getImageData(0, 0, 1, 1).data
  return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: (data[3] ?? 255) / 255 }
}

/** Parsed if we can, otherwise asked of the browser. Null when neither knows it. */
export function resolveCssColor(css: string): Rgba | null {
  if (css.trim().length === 0) return null
  return parseCssColor(css) ?? probeColor(css)
}

const byte = (v: number) => Math.round(clamp(v, 0, 255))

/** `#rrggbb`, ignoring alpha. three.js `Color` reads it as sRGB. */
export function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`
}

/** `#rrggbb` when opaque, else `rgba(r,g,b,a)`. Konva and SVG take either. */
export function toCss(color: Rgba): string {
  if (color.a >= 1) return toHex(color)
  const a = Math.round(color.a * 1000) / 1000
  // raw colour: formats a resolved theme colour, not a literal
  return `rgba(${byte(color.r)},${byte(color.g)},${byte(color.b)},${a})`
}
