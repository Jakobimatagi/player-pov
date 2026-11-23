/**
 * WCAG 2.1 contrast check over the theme tokens in src/index.css (issue #76).
 *
 * The test reads both palettes straight out of the CSS (the dark default in `:root` and the light
 * one in `:root[data-theme='light']`), converts each token to sRGB, and checks every
 * foreground/background pair the app actually puts together against AA:
 *   - 4.5:1 for body text
 *   - 3:1 for large text and UI components (borders, inputs, focus rings, icons)
 *
 * Reading the table: `npm test -- contrast` prints one row per palette and pair with the ratio, the
 * threshold, and PASS / FAIL / KNOWN (a failure listed in KNOWN_FAILURES below), then the
 * decorative edges (DECOR), which are exempt from 3:1 and listed with the reason in DECORATIVE.
 *
 * KNOWN_FAILURES holds accepted failures. They are expected, so CI stays green, but each one is
 * asserted to STILL fail: when a pair gets fixed its test goes red with "now passes, remove it
 * from KNOWN_FAILURES", so the list can only shrink. A pair that is not in the list must pass.
 * The palette ticket (#80) emptied it; keep it empty.
 *
 * Colour maths: oklch -> oklab -> linear sRGB, clipped per channel to [0, 1] (what browsers do when
 * they paint an out-of-gamut colour on an sRGB screen), then gamma-encoded. Translucent tokens and
 * Tailwind opacity modifiers (`ring-ring/50`, `bg-destructive/20`) are composited over the surface
 * in gamma-encoded sRGB, the way the browser blends them. Relative luminance and the ratio follow
 * WCAG 2.1 (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------------------------
// Pairs. Chosen from how the tokens are used in src/ (Tailwind classes and var(--token) in CSS):
//   foreground on every surface: body text sits on background, cards, popovers, muted panels,
//     secondary buttons and the sidebar.
//   muted-foreground (115 `text-muted-foreground` uses, 84 `var(--muted-foreground)`): hints and
//     captions on background, card, popover, muted and secondary.
//   primary-foreground on primary: default buttons, badges.
//   primary as text: links and accent labels (`text-primary`, `color: var(--primary)`).
//   destructive text: error messages and overdue notes on background and card, and the
//     destructive button / badge (`bg-destructive/10`, `/20` under the unused `dark:` variant).
//   success (billing status, landing ticks), warning, info and gold text on background and card;
//     status text on its own `*-subtle` background (alerts use var(--warning-subtle) etc.).
//   input (form field edges) on background, card and popover: 3:1 UI component. border, control
//     and sidebar-border are decorative edges, listed in DECORATIVE below with the reason.
//   ring: the `focus-ring` outline (2px, 2px gap) on every surface it is drawn over; sidebar-ring
//     hugging sidebar items. See the comments on those pairs for how each is drawn.
// ---------------------------------------------------------------------------------------------

const TEXT = 4.5
const UI = 3

interface Pair {
  /** Foreground token (without the leading --). */
  fg: string
  /** Extra opacity on the foreground, as in a Tailwind `/50` modifier. */
  fgAlpha?: number
  /** Surface token the pair is painted on. */
  bg: string
  /** Optional translucent layer between the surface and the foreground (e.g. `bg-destructive/20`). */
  layer?: { token: string; alpha: number }
  min: number
  use: string
  /** Limit the pair to one palette, for classes that only apply in one mode (`dark:` variants). */
  only?: 'dark' | 'light'
}

const id = (p: Pair) =>
  `${p.fg}${p.fgAlpha ? `/${p.fgAlpha * 100}` : ''} on ${p.layer ? `${p.layer.token}/${p.layer.alpha * 100} over ` : ''}${p.bg}`

const surfaces = (fg: string, bgs: string[], min: number, use: string): Pair[] =>
  bgs.map((bg) => ({ fg, bg, min, use }))

const PAIRS: Pair[] = [
  ...surfaces(
    'foreground',
    ['background', 'card', 'popover', 'muted', 'secondary', 'accent'],
    TEXT,
    'body text',
  ),
  { fg: 'card-foreground', bg: 'card', min: TEXT, use: 'card text' },
  { fg: 'popover-foreground', bg: 'popover', min: TEXT, use: 'menu text' },
  { fg: 'secondary-foreground', bg: 'secondary', min: TEXT, use: 'secondary button' },
  { fg: 'accent-foreground', bg: 'accent', min: TEXT, use: 'hovered menu item' },
  { fg: 'sidebar-foreground', bg: 'sidebar', min: TEXT, use: 'sidebar text' },
  { fg: 'sidebar-accent-foreground', bg: 'sidebar-accent', min: TEXT, use: 'active sidebar item' },
  ...surfaces(
    'muted-foreground',
    ['background', 'card', 'popover', 'muted', 'secondary'],
    TEXT,
    'hint / caption',
  ),
  { fg: 'primary-foreground', bg: 'primary', min: TEXT, use: 'primary button' },
  {
    fg: 'sidebar-primary-foreground',
    bg: 'sidebar-primary',
    min: TEXT,
    use: 'sidebar primary item',
  },
  ...surfaces('primary', ['background', 'card', 'sidebar'], TEXT, 'link / accent text'),
  ...surfaces('destructive', ['background', 'card'], TEXT, 'error text'),
  {
    fg: 'destructive',
    bg: 'background',
    layer: { token: 'destructive', alpha: 0.2 },
    min: TEXT,
    use: 'destructive button, badge',
    only: 'dark',
  },
  // `bg-destructive/10` is the base class; the `dark:` variants (`/20`) only apply under a
  // `.dark` ancestor, which the app does not set yet, so the dark palette is checked with both.
  {
    fg: 'destructive',
    bg: 'background',
    layer: { token: 'destructive', alpha: 0.1 },
    min: TEXT,
    use: 'destructive button, badge',
  },
  { fg: 'destructive', bg: 'danger-subtle', min: TEXT, use: 'error alert' },
  ...['success', 'warning', 'info', 'gold'].flatMap((tone) =>
    surfaces(tone, ['background', 'card'], TEXT, `${tone} text`),
  ),
  ...['success', 'warning', 'info'].map((tone): Pair => ({
    fg: tone,
    bg: `${tone}-subtle`,
    min: TEXT,
    use: `${tone} alert`,
  })),
  // Form field edges (Input, and the inputs, selects and textareas styled in src/**/*.css): the
  // edge is the only cue that a field is there, so it needs 3:1 on every surface fields sit on.
  ...surfaces('input', ['background', 'card', 'popover'], UI, 'form field edge'),
  // Focus ring. Everything focusable outside the sidebar draws it with the `focus-ring` utility
  // (src/index.css): a solid 2px --ring outline with a 2px transparent offset. The offset shows
  // the surface the element sits on, so the ring is bordered by that surface on both sides and
  // never touches the element's own fill. That is how an orange ring works around an orange
  // primary button: the pair that matters is ring vs the surface, not ring vs primary.
  ...surfaces(
    'ring',
    ['background', 'card', 'popover', 'muted', 'secondary', 'sidebar'],
    UI,
    'focus ring (outline, 2px gap)',
  ),
  // Sidebar menu items draw a 2px `ring-sidebar-ring` box-shadow hugging the item (no gap, so the
  // scrolling sidebar cannot clip it): bordered by the sidebar outside and by the item's fill
  // inside, which is the sidebar or, when hovered or active, sidebar-accent.
  { fg: 'sidebar-ring', bg: 'sidebar', min: UI, use: 'sidebar focus ring' },
  { fg: 'sidebar-ring', bg: 'sidebar-accent', min: UI, use: 'sidebar focus ring, active item' },
]

/**
 * Decorative edges: printed in the table (DECOR) but not held to 3:1. WCAG 1.4.11 asks for 3:1
 * only where the edge is needed to identify a component or its state. These edges are not:
 *   - border: card and section edges, table rules, separators. The card fill, spacing and
 *     headings carry the grouping; the hairline is decoration.
 *   - control: the edge and tint of buttons, chips, tabs and panels. A button is identified by
 *     its text label, not by its outline.
 *   - sidebar-border: the sidebar's edge and its separators.
 * Anything whose edge IS what identifies it (a text field, a select, a textarea, a swatch with no
 * other cue) must use --input, which is checked in PAIRS.
 */
const DECORATIVE: Pair[] = [
  ...surfaces('border', ['background', 'card'], 0, 'card edge, divider (decorative)'),
  ...surfaces('control', ['background', 'card'], 0, 'labelled button / chip edge (decorative)'),
  { fg: 'sidebar-border', bg: 'sidebar', min: 0, use: 'sidebar edge (decorative)' },
]

/**
 * Pairs that fail and are accepted for now, as `<palette>: <pair id>`. Expected failures: each is
 * asserted to still fail, so fixing one turns its test red until the entry is deleted here.
 * Empty since #80; add an entry only together with an issue that will fix it.
 */
const KNOWN_FAILURES = new Set<string>([])

// ---------------------------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------------------------

const css = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`src/index.css has no "${selector} {" block`)
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start))
  const tokens: Record<string, string> = {}
  for (const [, name = '', value = ''] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim()
  }
  return tokens
}

const darkTokens = block(':root')
const PALETTES: Record<string, Record<string, string>> = {
  dark: darkTokens,
  // The light block only overrides; anything it leaves out cascades from :root.
  light: { ...darkTokens, ...block(":root[data-theme='light']") },
}

// ---------------------------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------------------------

/** Gamma-encoded sRGB in [0, 1] plus alpha. */
type Rgba = [number, number, number, number]

const num = (s = '', percentScale = 1) =>
  s.endsWith('%') ? (parseFloat(s) / 100) * percentScale : parseFloat(s)

const encode = (c: number) => {
  const x = Math.min(1, Math.max(0, c)) // gamut clip
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

function parseColour(value: string, tokens: Record<string, string> = {}, depth = 0): Rgba {
  const v = value.trim()
  const ref = /^var\(--([\w-]+)\)$/.exec(v)?.[1]
  if (ref !== undefined) {
    const target = tokens[ref]
    if (depth > 10 || target === undefined) throw new Error(`Cannot resolve ${v}`)
    return parseColour(target, tokens, depth + 1)
  }
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v)?.[1]
  if (hex !== undefined) {
    let h = hex
    if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1]
  }
  const fn = /^(oklch|rgba?)\(([^)]+)\)$/i.exec(v)
  if (fn) {
    const [channels = '', alpha] = (fn[2] ?? '').split('/')
    const parts = channels.trim().split(/[\s,]+/)
    const a = alpha !== undefined ? num(alpha.trim()) : parts.length === 4 ? num(parts[3]) : 1
    if (fn[1]?.toLowerCase() === 'oklch') {
      const [L, C, H] = [num(parts[0]), num(parts[1], 0.4), num(parts[2])]
      return [...oklchToRgb(L, C, H), a]
    }
    const [r, g, b] = [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255)]
    return [r / 255, g / 255, b / 255, a]
  }
  throw new Error(`Unsupported colour value "${v}" (add support in tests/contrast.test.ts)`)
}

/** Paints `top` over an opaque `bottom`, in gamma-encoded sRGB like the browser does. */
const over = (top: Rgba, bottom: Rgba): Rgba => [
  top[0] * top[3] + bottom[0] * (1 - top[3]),
  top[1] * top[3] + bottom[1] * (1 - top[3]),
  top[2] * top[3] + bottom[2] * (1 - top[3]),
  1,
]

const withAlpha = (c: Rgba, alpha: number): Rgba => [c[0], c[1], c[2], c[3] * alpha]

const luminance = ([r, g, b]: Rgba) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: Rgba, b: Rgba): number {
  const hi = Math.max(luminance(a), luminance(b))
  const lo = Math.min(luminance(a), luminance(b))
  return (hi + 0.05) / (lo + 0.05)
}

function ratio(tokens: Record<string, string>, pair: Pair): number {
  const colour = (name: string) => {
    const value = tokens[name]
    if (value === undefined) throw new Error(`Token --${name} is not defined in src/index.css`)
    return parseColour(value, tokens)
  }
  // Surfaces are painted over the page background; the page itself is opaque.
  let bg = over(colour(pair.bg), colour('background'))
  if (pair.layer) bg = over(withAlpha(colour(pair.layer.token), pair.layer.alpha), bg)
  const fg = over(withAlpha(colour(pair.fg), pair.fgAlpha ?? 1), bg)
  return contrast(fg, bg)
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('colour maths', () => {
  it('matches known WCAG ratios', () => {
    expect(contrast(parseColour('#000'), parseColour('#fff'))).toBeCloseTo(21, 5)
    expect(contrast(parseColour('#767676'), parseColour('#fff'))).toBeCloseTo(4.54, 2)
    expect(contrast(parseColour('rgb(255 0 0)'), parseColour('#fff'))).toBeCloseTo(4.0, 1)
  })

  it('converts oklch to the sRGB browsers paint', () => {
    const white = parseColour('oklch(1 0 0)')
    expect(white.slice(0, 3).map((c) => Math.round(c * 255))).toEqual([255, 255, 255])
    // oklch(0.628 0.2577 29.23) is CSS `red`.
    const red = parseColour('oklch(62.8% 0.2577 29.23)')
    expect(red.slice(0, 3).map((c) => Math.round(c * 255))).toEqual([255, 0, 0])
  })
})

const rows = Object.entries(PALETTES).flatMap(([palette, tokens]) =>
  PAIRS.filter((pair) => !pair.only || pair.only === palette).map((pair) => {
    const key = `${palette}: ${id(pair)}`
    const value = ratio(tokens, pair)
    const pass = value >= pair.min
    return { key, palette, pair, value, pass, known: KNOWN_FAILURES.has(key) }
  }),
)

const decorativeRows = Object.entries(PALETTES).flatMap(([palette, tokens]) =>
  DECORATIVE.map((pair) => ({ key: `${palette}: ${id(pair)}`, pair, value: ratio(tokens, pair) })),
)

/** Decorative edges are exempt from 3:1 but must still be there to see. */
const DECORATIVE_FLOOR = 1.1

const table = [
  'Contrast (WCAG 2.1 AA) — PASS, FAIL, KNOWN (expected failure, see KNOWN_FAILURES) or DECOR',
  ...rows.map(
    (r) =>
      `${r.pass ? 'PASS ' : r.known ? 'KNOWN' : 'FAIL '}  ${r.value.toFixed(2).padStart(5)}:1  ` +
      `(min ${String(r.pair.min).padEnd(3)})  ${r.key.padEnd(54)} ${r.pair.use}`,
  ),
  ...decorativeRows.map(
    (r) =>
      `DECOR  ${r.value.toFixed(2).padStart(5)}:1  (min —  )  ${r.key.padEnd(54)} ${r.pair.use}`,
  ),
].join('\n')
process.stdout.write(`\n${table}\n\n`)

describe('decorative edges', () => {
  for (const r of decorativeRows) {
    it(`${r.key} is visible (>= ${DECORATIVE_FLOOR}:1, exempt from 3:1)`, () => {
      expect(r.value).toBeGreaterThanOrEqual(DECORATIVE_FLOOR)
    })
  }
})

describe('theme contrast', () => {
  it('every KNOWN_FAILURES entry names a pair the test checks', () => {
    const keys = new Set(rows.map((r) => r.key))
    expect([...KNOWN_FAILURES].filter((k) => !keys.has(k))).toEqual([])
  })

  for (const r of rows) {
    it(`${r.key} >= ${r.pair.min}:1 (${r.pair.use})`, () => {
      if (r.known) {
        expect(
          r.pass,
          `${r.key} now passes (${r.value.toFixed(2)}:1): remove it from KNOWN_FAILURES`,
        ).toBe(false)
      } else {
        expect(
          r.value,
          `${r.key} is ${r.value.toFixed(2)}:1, needs ${r.pair.min}:1`,
        ).toBeGreaterThanOrEqual(r.pair.min)
      }
    })
  }
})
