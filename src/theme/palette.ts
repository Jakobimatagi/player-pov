import { resolveCssColor, toCss } from './color'

/**
 * Colours for the views that draw on a canvas or in WebGL: the Konva play diagram, the 3D
 * scene, the SVG play chart and the no-WebGL preview. Canvas and WebGL cannot read CSS
 * variables, so each colour is a theme token in `src/index.css`, read and converted here.
 *
 * Player colours (the seven token colours, team jerseys) are not here; they live in
 * `./playerColors`.
 */

/** The Konva play diagram: editor, playbook thumbnails, formation cards. */
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
  /** The white half of a half-white token. */
  split: string
  /** Sticky-note comments. */
  note: string
  noteBorder: string
  noteInk: string
}

/** The 3D scene. All opaque; three.js reads them as sRGB. */
export interface FieldPalette {
  sky: string
  /** The two mow stripes. */
  turf: string
  turfStripe: string
  /** Yard lines, hashes, numbers, boundaries. */
  line: string
  goalpost: string
  ball: string
  /** The debug route ribbons. */
  route: string
  /** Jersey number of the player the camera rides with. */
  highlight: string
  /** The `?spot=1` debug ball mark. */
  spot: string
}

/** The SVG play chart (`src/editor/EditorCanvas.tsx`). */
export interface EditorPalette {
  field: string
  line: string
  los: string
  select: string
}

/** The static 2D preview shown when WebGL is unavailable. */
export interface PreviewPalette {
  field: string
  endZone: string
  line: string
  routeOffense: string
  routeDefense: string
}

export interface ThemePalette {
  diagram: ScenePalette
  field: FieldPalette
  editor: EditorPalette
  preview: PreviewPalette
}

type Spec<T> = { [K in keyof T]: string }

/** Which CSS custom property each colour comes from. */
export const PALETTE_TOKENS: { [G in keyof ThemePalette]: Spec<ThemePalette[G]> } = {
  diagram: {
    field: '--diagram-field',
    endZone: '--diagram-end-zone',
    grid: '--diagram-grid',
    yard: '--diagram-yard-line',
    goal: '--diagram-goal-line',
    number: '--diagram-number',
    los: '--diagram-scrimmage',
    select: '--diagram-select',
    selectFill: '--diagram-select-fill',
    stroke: '--diagram-token-stroke',
    text: '--diagram-text',
    ink: '--diagram-ink',
    lineWhite: '--diagram-line-white',
    lineBlack: '--diagram-line-black',
    split: '--diagram-split',
    note: '--diagram-note',
    noteBorder: '--diagram-note-border',
    noteInk: '--diagram-note-ink',
  },
  field: {
    sky: '--field-sky',
    turf: '--field-turf',
    turfStripe: '--field-turf-stripe',
    line: '--field-line',
    goalpost: '--field-goalpost',
    ball: '--field-ball',
    route: '--field-route',
    highlight: '--field-highlight',
    spot: '--field-spot',
  },
  editor: {
    field: '--editor-field',
    line: '--editor-line',
    los: '--editor-scrimmage',
    select: '--editor-select',
  },
  preview: {
    field: '--preview-field',
    endZone: '--preview-end-zone',
    line: '--preview-line',
    routeOffense: '--preview-route-offense',
    routeDefense: '--preview-route-defense',
  },
}

/**
 * The dark (default) theme's tokens, converted. Used on the server, in Node tests and for any
 * token the page does not define. `tests/theme-palette.test.ts` checks these against
 * `src/index.css`, so a token change there fails until this is updated too.
 */
export const FALLBACK_PALETTE: ThemePalette = {
  diagram: {
    field: '#060e1b', // raw colour: Node/SSR fallback, mirrors src/index.css
    endZone: '#0c1625', // raw colour: Node/SSR fallback, mirrors src/index.css
    grid: 'rgba(242,245,249,0.05)', // raw colour: Node/SSR fallback, mirrors src/index.css
    yard: 'rgba(242,245,249,0.13)', // raw colour: Node/SSR fallback, mirrors src/index.css
    goal: 'rgba(242,245,249,0.4)', // raw colour: Node/SSR fallback, mirrors src/index.css
    number: 'rgba(242,245,249,0.16)', // raw colour: Node/SSR fallback, mirrors src/index.css
    los: '#5dc0f6', // raw colour: Node/SSR fallback, mirrors src/index.css
    select: '#f7c747', // raw colour: Node/SSR fallback, mirrors src/index.css
    selectFill: 'rgba(247,199,71,0.14)', // raw colour: Node/SSR fallback, mirrors src/index.css
    stroke: 'rgba(242,245,249,0.9)', // raw colour: Node/SSR fallback, mirrors src/index.css
    text: '#f2f5f9', // raw colour: Node/SSR fallback, mirrors src/index.css
    ink: '#1f2328', // raw colour: Node/SSR fallback, mirrors src/index.css
    lineWhite: '#f2f5f9', // raw colour: Node/SSR fallback, mirrors src/index.css
    lineBlack: '#9499a0', // raw colour: Node/SSR fallback, mirrors src/index.css
    split: '#f4f1ea', // raw colour: Node/SSR fallback, mirrors src/index.css
    note: '#fff3a8', // raw colour: Node/SSR fallback, mirrors src/index.css
    noteBorder: '#8a7a2b', // raw colour: Node/SSR fallback, mirrors src/index.css
    noteInk: '#2b2400', // raw colour: Node/SSR fallback, mirrors src/index.css
  },
  field: {
    sky: '#cfe3f5', // raw colour: Node/SSR fallback, mirrors src/index.css
    turf: '#89c683', // raw colour: Node/SSR fallback, mirrors src/index.css
    turfStripe: '#7fbc7b', // raw colour: Node/SSR fallback, mirrors src/index.css
    line: '#ffffff', // raw colour: Node/SSR fallback, mirrors src/index.css
    goalpost: '#f7e16c', // raw colour: Node/SSR fallback, mirrors src/index.css
    ball: '#c4a574', // raw colour: Node/SSR fallback, mirrors src/index.css
    route: '#fff4c2', // raw colour: Node/SSR fallback, mirrors src/index.css
    highlight: '#ffe57c', // raw colour: Node/SSR fallback, mirrors src/index.css
    spot: '#c8102e', // raw colour: Node/SSR fallback, mirrors src/index.css
  },
  editor: {
    field: '#2f6b35', // raw colour: Node/SSR fallback, mirrors src/index.css
    line: 'rgba(255,255,255,0.55)', // raw colour: Node/SSR fallback, mirrors src/index.css
    los: '#4aa3ff', // raw colour: Node/SSR fallback, mirrors src/index.css
    select: '#ffd84a', // raw colour: Node/SSR fallback, mirrors src/index.css
  },
  preview: {
    field: '#1d6b32', // raw colour: Node/SSR fallback, mirrors src/index.css
    endZone: '#164e26', // raw colour: Node/SSR fallback, mirrors src/index.css
    line: '#ffffff', // raw colour: Node/SSR fallback, mirrors src/index.css
    routeOffense: '#ffb3c1', // raw colour: Node/SSR fallback, mirrors src/index.css
    routeDefense: '#d0d0d0', // raw colour: Node/SSR fallback, mirrors src/index.css
  },
}

/** Kept for existing imports: the diagram's part of the fallback. */
export const DEFAULT_PALETTE: ScenePalette = FALLBACK_PALETTE.diagram

function group<T extends object>(spec: Spec<T>, fallback: T, read: (token: string) => string): T {
  const out = { ...fallback }
  for (const key of Object.keys(spec) as (keyof T)[]) {
    const color = resolveCssColor(read(spec[key]))
    if (color != null) (out as Record<keyof T, string>)[key] = toCss(color)
  }
  return out
}

/**
 * The palette for a theme. `read` returns a custom property's value; by default it reads the
 * page's root element. Without a page (server, Node) this is the fallback palette.
 */
export function resolveThemePalette(read?: (token: string) => string): ThemePalette {
  let get = read
  if (get == null) {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
      return FALLBACK_PALETTE
    }
    const style = getComputedStyle(document.documentElement)
    get = (token) => style.getPropertyValue(token).trim()
  }
  return {
    diagram: group(PALETTE_TOKENS.diagram, FALLBACK_PALETTE.diagram, get),
    field: group(PALETTE_TOKENS.field, FALLBACK_PALETTE.field, get),
    editor: group(PALETTE_TOKENS.editor, FALLBACK_PALETTE.editor, get),
    preview: group(PALETTE_TOKENS.preview, FALLBACK_PALETTE.preview, get),
  }
}

/** The diagram palette for the page's current theme. */
export function resolvePalette(): ScenePalette {
  return resolveThemePalette().diagram
}
