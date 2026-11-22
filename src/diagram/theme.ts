/**
 * Colours for the Konva scene, taken from the app's own theme variables so the editor
 * matches the rest of the app. Canvas cannot read CSS variables, so they are resolved here.
 */
export interface ScenePalette {
  field: string
  endZone: string
  grid: string
  yard: string
  goal: string
  number: string
  los: string
  select: string
  selectFill: string
  /** Outline of a token. */
  stroke: string
  /** Free text on the field. */
  text: string
  /** Text on a white or half-white token. */
  ink: string
  /** Line colours for white and black players, which would vanish on the field as they are. */
  lineWhite: string
  lineBlack: string
}

/** The dark theme's values, used on the server and where a colour cannot be resolved. */
export const DEFAULT_PALETTE: ScenePalette = {
  field: '#16171a',
  endZone: '#1d1e22',
  grid: 'rgba(255,255,255,0.05)',
  yard: 'rgba(255,255,255,0.13)',
  goal: 'rgba(255,255,255,0.4)',
  number: 'rgba(255,255,255,0.16)',
  los: '#5aa2e8',
  select: '#e6c34a',
  selectFill: 'rgba(230,195,74,0.14)',
  stroke: 'rgba(255,255,255,0.9)',
  text: '#f5f5f6',
  ink: '#1f2328',
  lineWhite: '#f1f1f3',
  lineBlack: '#9a9ea6',
}

type Rgb = [number, number, number]

let probe: CanvasRenderingContext2D | null | undefined

/** A CSS colour (any syntax the browser knows, oklch included) as rgb, or null if it can't. */
export function cssToRgb(css: string): Rgb | null {
  if (typeof document === 'undefined' || css.length === 0) return null
  if (probe === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (probe == null) return null
  // A colour the browser rejects leaves fillStyle at the sentinel.
  probe.fillStyle = '#ff00fe'
  probe.fillStyle = css
  if (probe.fillStyle === '#ff00fe') return null
  probe.clearRect(0, 0, 1, 1)
  probe.fillRect(0, 0, 1, 1)
  const data = probe.getImageData(0, 0, 1, 1).data
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0]
}

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a})`
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/** The palette for the page's current theme. */
export function resolvePalette(): ScenePalette {
  if (typeof document === 'undefined') return DEFAULT_PALETTE
  const style = getComputedStyle(document.documentElement)
  const get = (name: string) => cssToRgb(style.getPropertyValue(name).trim())
  const background = get('--background')
  const foreground = get('--foreground')
  if (background == null || foreground == null) return DEFAULT_PALETTE
  const card = get('--card') ?? mix(background, foreground, 0.04)
  const los = get('--chart-3')
  const gold = get('--gold')
  return {
    field: hex(background),
    endZone: hex(card),
    grid: rgba(foreground, 0.05),
    yard: rgba(foreground, 0.13),
    goal: rgba(foreground, 0.4),
    number: rgba(foreground, 0.16),
    los: los != null ? hex(los) : DEFAULT_PALETTE.los,
    select: gold != null ? hex(gold) : DEFAULT_PALETTE.select,
    selectFill: rgba(gold ?? [230, 195, 74], 0.14),
    stroke: rgba(foreground, 0.9),
    text: hex(foreground),
    ink: '#1f2328',
    lineWhite: hex(foreground),
    lineBlack: hex(mix(background, foreground, 0.6)),
  }
}
