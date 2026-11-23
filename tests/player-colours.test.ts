/**
 * Colour-blind-safe player colours (issue #77).
 *
 * Checks the player colours in src/theme/playerColors.ts against the field tokens in src/index.css
 * (dark theme, the one the app ships; the light theme is not reachable from the UI yet):
 *
 *   1. Distinguishable. Every pair of the seven token colours, and every pair of the line colours
 *      drawn for them, is at least MIN_DELTA_E apart (CIEDE2000) in normal vision and in simulated
 *      protanopia, deuteranopia and tritanopia. Offense and defense team colours too.
 *   2. Field contrast. Each token and its line has at least 3:1 (WCAG 2.1 non-text contrast)
 *      against the diagram field and end zone they are drawn on. Black is the exception by
 *      design: no fill that still reads as black reaches 3:1 on navy, so the black token is
 *      checked by its outline (the light `--diagram-token-stroke` ring every token gets), which
 *      must have 3:1 against the field and against the black fill.
 *   3. Label contrast. Each token's label ink has at least 4.5:1 against the token.
 *
 * Where the token colours are drawn: only the Konva play diagram (DiagramScene: editor, playbook
 * thumbnails), on `--diagram-field` and `--diagram-end-zone`. The 3D scene and the no-WebGL
 * preview draw TEAM_COLOR (jerseys, O/X marks) on `--field-turf`/`--field-turf-stripe` and
 * `--preview-field`; those are checked in the last block. Pairs that cannot pass because of the
 * field colour itself are listed in FIELD_LIMITED and asserted to still fail, so the list can only
 * shrink once the field tokens change (#80).
 *
 * Simulation: Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear sRGB, the
 * standard full-dichromacy matrices (as in DaltonLens, Chromium's DevTools emulation).
 *
 * Threshold: ΔE00 ≈ 2 is a just-noticeable difference side by side; categorical palettes for
 * small marks usually aim for 10+. Tokens are small (about 20 px) and seen at a glance, often on
 * a phone or a projector, so we ask for 15 to leave margin for display and viewing variance.
 *
 * `npx vitest run player-colours --silent=false` prints the tables.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lineHex, onHex } from '../src/diagram/colors'
import { TOKEN_COLORS as TOKEN_NAMES, type TokenColor } from '../src/diagram/types'
import { parseCssColor } from '../src/theme/color'
import { resolveThemePalette } from '../src/theme/palette'
import { TEAM_COLOR, TOKEN_COLORS } from '../src/theme/playerColors'

const MIN_DELTA_E = 15
const NON_TEXT = 3
const TEXT = 4.5

// --- colour maths --------------------------------------------------------------------------------

type Rgb = [number, number, number] // gamma-encoded sRGB, 0..1

function rgb(css: string, over?: Rgb): Rgb {
  const c = parseCssColor(css)
  if (c == null) throw new Error(`cannot parse ${css}`)
  const own: Rgb = [c.r / 255, c.g / 255, c.b / 255]
  if (c.a >= 1 || over == null) return own
  // Composite in gamma-encoded sRGB, as the browser and canvas do.
  return own.map((v, i) => v * c.a + over[i]! * (1 - c.a)) as Rgb
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => {
  const c = Math.min(1, Math.max(0, v))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map(toLinear) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia'
const VISIONS: Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']

/** Machado et al. 2009, severity 1.0, linear sRGB in and out. */
const MACHADO: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

function simulate(c: Rgb, vision: Vision): Rgb {
  if (vision === 'normal') return c
  const lin = c.map(toLinear)
  return MACHADO[vision].map((row) =>
    toGamma(row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!),
  ) as Rgb
}

/** CIELAB, D65. */
function lab(c: Rgb): [number, number, number] {
  const [r, g, b] = c.map(toLinear) as Rgb
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** CIEDE2000 (Sharma, Wu & Dalal 2005), kL = kC = kH = 1. */
function deltaE2000(p: [number, number, number], q: [number, number, number]): number {
  const [L1, a1, b1] = p
  const [L2, a2, b2] = q
  const rad = Math.PI / 180
  const Cbar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
  const ap1 = a1 * (1 + G)
  const ap2 = a2 * (1 + G)
  const Cp1 = Math.hypot(ap1, b1)
  const Cp2 = Math.hypot(ap2, b2)
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0
    const h = Math.atan2(b, a) / rad
    return h < 0 ? h + 360 : h
  }
  const h1 = hue(b1, ap1)
  const h2 = hue(b2, ap2)
  const dL = L2 - L1
  const dC = Cp2 - Cp1
  let dh = 0
  if (Cp1 * Cp2 !== 0) {
    dh = h2 - h1
    if (dh > 180) dh -= 360
    else if (dh < -180) dh += 360
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * rad) / 2)
  const Lbar = (L1 + L2) / 2
  const Cpbar = (Cp1 + Cp2) / 2
  let hbar = h1 + h2
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(h1 - h2) > 180) hbar = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2
    else hbar = (h1 + h2) / 2
  }
  const T =
    1 -
    0.17 * Math.cos((hbar - 30) * rad) +
    0.24 * Math.cos(2 * hbar * rad) +
    0.32 * Math.cos((3 * hbar + 6) * rad) -
    0.2 * Math.cos((4 * hbar - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cpbar ** 7 / (Cpbar ** 7 + 25 ** 7))
  const SL = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2)
  const SC = 1 + 0.045 * Cpbar
  const SH = 1 + 0.015 * Cpbar * T
  const RT = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))
}

const deltaE = (a: Rgb, b: Rgb, vision: Vision) =>
  deltaE2000(lab(simulate(a, vision)), lab(simulate(b, vision)))

// --- theme ---------------------------------------------------------------------------------------

const CSS = readFileSync('src/index.css', 'utf8')
const darkStart = CSS.indexOf(':root {')
const darkBody = CSS.slice(darkStart, CSS.indexOf('\n}', darkStart))
const darkTokens = new Map(
  [...darkBody.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1]!, m[2]!.trim()]),
)
const read = (name: string): string =>
  (darkTokens.get(name) ?? '').replace(/var\((--[\w-]+)\)/g, (_, ref: string) => read(ref))
const theme = resolveThemePalette(read)

const FIELDS = {
  'diagram field': rgb(theme.diagram.field),
  'diagram end zone': rgb(theme.diagram.endZone),
}
const LINE_OVER = { white: theme.diagram.lineWhite, black: theme.diagram.lineBlack }

const names = [...TOKEN_NAMES] as TokenColor[]
const tokens = Object.fromEntries(names.map((n) => [n, rgb(TOKEN_COLORS[n])])) as Record<
  TokenColor,
  Rgb
>
const lines = Object.fromEntries(names.map((n) => [n, rgb(lineHex(n, LINE_OVER))])) as Record<
  TokenColor,
  Rgb
>

function minPair(set: Record<string, Rgb>, vision: Vision) {
  const keys = Object.keys(set)
  let min = { d: Infinity, pair: '' }
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const d = deltaE(set[keys[i]!]!, set[keys[j]!]!, vision)
      if (d < min.d) min = { d, pair: `${keys[i]}/${keys[j]}` }
    }
  }
  return min
}

const f2 = (v: number) => v.toFixed(2)

// --- tests ---------------------------------------------------------------------------------------

describe('player token colours (#77)', () => {
  it('keeps the seven colour names saved plays reference', () => {
    expect(Object.keys(TOKEN_COLORS).sort()).toEqual([...names].sort())
  })

  it(`keeps every pair of tokens and of lines at least ΔE00 ${MIN_DELTA_E} apart under CVD`, () => {
    const rows = VISIONS.map((vision) => {
      const t = minPair(tokens, vision)
      const l = minPair(lines, vision)
      return {
        vision,
        'min ΔE tokens': f2(t.d),
        'closest tokens': t.pair,
        'min ΔE lines': f2(l.d),
        'closest lines': l.pair,
      }
    })
    console.table(rows)
    for (const vision of VISIONS) {
      expect(minPair(tokens, vision).d, `tokens, ${vision}`).toBeGreaterThanOrEqual(MIN_DELTA_E)
      expect(minPair(lines, vision).d, `lines, ${vision}`).toBeGreaterThanOrEqual(MIN_DELTA_E)
    }
  })

  it('gives each token and line 3:1 on the field, and each label 4.5:1 on its token', () => {
    const stroke = theme.diagram.stroke
    const rows = names.map((n) => {
      const row: Record<string, string> = { colour: n, hex: TOKEN_COLORS[n], ink: onHex(n) }
      for (const [field, bg] of Object.entries(FIELDS)) {
        row[`token / ${field}`] =
          n === 'black'
            ? `${f2(contrast(tokens[n], bg))} (outline ${f2(contrast(rgb(stroke, bg), bg))})`
            : f2(contrast(tokens[n], bg))
        row[`line / ${field}`] = f2(contrast(lines[n], bg))
      }
      row['label / token'] = f2(contrast(rgb(onHex(n)), tokens[n]))
      return row
    })
    console.table(rows)

    for (const n of names) {
      for (const [field, bg] of Object.entries(FIELDS)) {
        expect(contrast(lines[n], bg), `${n} line on ${field}`).toBeGreaterThanOrEqual(NON_TEXT)
        if (n === 'black') {
          // Seen by its outline: the ring must stand out from the field and from the fill.
          const ring = rgb(stroke, bg)
          expect(contrast(ring, bg), `black outline on ${field}`).toBeGreaterThanOrEqual(NON_TEXT)
          expect(contrast(ring, tokens.black), 'black outline on fill').toBeGreaterThanOrEqual(
            NON_TEXT,
          )
        } else {
          expect(contrast(tokens[n], bg), `${n} on ${field}`).toBeGreaterThanOrEqual(NON_TEXT)
        }
      }
      expect(contrast(rgb(onHex(n)), tokens[n]), `label on ${n}`).toBeGreaterThanOrEqual(TEXT)
    }
  })
})

/**
 * Team colours on fields where they cannot reach 3:1 because of the field colour itself. Each is
 * asserted to still fail, so when a field token changes and one passes, the test says to remove it.
 */
const FIELD_LIMITED = new Set([
  // A white jersey on light turf: even #ffffff is only ~2:1 on #89c683.
  'defense jersey / 3D turf',
  'defense jersey / 3D turf stripe',
  // A red that reads on the light 3D turf is as dark as the dark-green preview field.
  'offense mark / 2D preview field',
])

describe('team colours (#77)', () => {
  const team = { offense: rgb(TEAM_COLOR.offense), defense: rgb(TEAM_COLOR.defense) }
  const surfaces: [string, Rgb, string][] = [
    ['3D turf', rgb(theme.field.turf), 'jersey'],
    ['3D turf stripe', rgb(theme.field.turfStripe), 'jersey'],
    ['2D preview field', rgb(theme.preview.field), 'mark'],
  ]
  const cases = (['offense', 'defense'] as const).flatMap((side) =>
    surfaces.map(([field, bg, what]) => ({ id: `${side} ${what} / ${field}`, fg: team[side], bg })),
  )

  it('prints the team colour table', () => {
    console.table(
      cases.map((c) => ({
        pair: c.id,
        contrast: f2(contrast(c.fg, c.bg)),
        ...Object.fromEntries(VISIONS.map((v) => [`ΔE ${v}`, f2(deltaE(c.fg, c.bg, v))])),
        status: FIELD_LIMITED.has(c.id) ? 'FIELD-LIMITED' : 'PASS',
      })),
    )
  })

  it('keeps offense and defense apart under every vision', () => {
    for (const vision of VISIONS) {
      expect(deltaE(team.offense, team.defense, vision), vision).toBeGreaterThanOrEqual(MIN_DELTA_E)
    }
  })

  for (const c of cases) {
    if (FIELD_LIMITED.has(c.id)) {
      it(`${c.id}: still field-limited (remove it from FIELD_LIMITED once it passes)`, () => {
        expect(contrast(c.fg, c.bg)).toBeLessThan(NON_TEXT)
      })
    } else {
      it(`${c.id}: at least 3:1 and ΔE00 ${MIN_DELTA_E} under every vision`, () => {
        expect(contrast(c.fg, c.bg)).toBeGreaterThanOrEqual(NON_TEXT)
        for (const vision of VISIONS) {
          expect(deltaE(c.fg, c.bg, vision), vision).toBeGreaterThanOrEqual(MIN_DELTA_E)
        }
      })
    }
  }
})
