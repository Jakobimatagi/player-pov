import type { FieldPreset, LineType, Pt } from './types'
import { FIELD_PRESETS } from './types'

/** Where the line of scrimmage sits, as a fraction of the field's height from the top. */
export const LOS_Y = 0.62
/** Yards the view shows top to bottom. */
export const VIEW_YARDS = 32

/** A line shorter than this many token radii is not drawn, so none is ever added that short. */
export const MIN_LINE_RADII = 1.2

export interface LinePart {
  points: number[]
  dash?: number[]
}

export interface LineShape {
  /** Strokes, in px, each a flat [x0, y0, x1, y1, …]. */
  parts: LinePart[]
  /** Filled triangle at the end: [x, y, x, y, x, y]. */
  arrow?: number[]
  /** Filled dot at the end. */
  dot?: { x: number; y: number; r: number }
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const len = (a: Pt) => Math.hypot(a.x, a.y)

/** Perpendicular cap of half-width `half` centred on `at`, across direction (ux, uy). */
function cap(at: Pt, ux: number, uy: number, half: number): LinePart {
  return {
    points: [at.x - uy * half, at.y + ux * half, at.x + uy * half, at.y - ux * half],
  }
}

function zigzag(a: Pt, b: Pt, amp: number, wave: number): number[] {
  const total = len(sub(b, a))
  if (total < 1) return [a.x, a.y, b.x, b.y]
  const ux = (b.x - a.x) / total
  const uy = (b.y - a.y) / total
  const steps = Math.max(2, Math.round(total / (wave / 2)))
  const out: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    // Flat at both ends so the line leaves the token and meets its end cleanly.
    const side = i === 0 || i === steps ? 0 : i % 2 === 0 ? -1 : 1
    const off = side * amp * Math.min(1, t * 8, (1 - t) * 8)
    out.push(a.x + (b.x - a.x) * t - uy * off, a.y + (b.y - a.y) * t + ux * off)
  }
  return out
}

/**
 * What to draw for one line, in px. `from` and `to` are the token centre and the endpoint;
 * `unit` is the token radius, which sizes caps, arrowheads and dashes. The line starts at the
 * token's edge, not its centre.
 */
export function lineShape(type: LineType, from: Pt, to: Pt, unit: number): LineShape {
  const d = sub(to, from)
  const total = len(d)
  if (total < unit * MIN_LINE_RADII) return { parts: [] }
  const ux = d.x / total
  const uy = d.y / total
  const a: Pt = { x: from.x + ux * unit * 1.05, y: from.y + uy * unit * 1.05 }
  const b = to
  // A slim arrowhead: about 12px long and 10 wide next to a 13px-radius token.
  const head = unit * 0.95
  const arrowAt = (): number[] => {
    const bx = b.x - ux * head
    const by = b.y - uy * head
    return [
      b.x,
      b.y,
      bx - uy * head * 0.42,
      by + ux * head * 0.42,
      bx + uy * head * 0.42,
      by - ux * head * 0.42,
    ]
  }
  // The shaft stops inside the arrowhead so a thick line doesn't poke through it.
  const shaftEnd: Pt = { x: b.x - ux * head * 0.8, y: b.y - uy * head * 0.8 }
  switch (type) {
    case 'route':
      return { parts: [{ points: [a.x, a.y, shaftEnd.x, shaftEnd.y] }], arrow: arrowAt() }
    case 'dashedRoute':
      return {
        parts: [{ points: [a.x, a.y, shaftEnd.x, shaftEnd.y], dash: [unit * 0.9, unit * 0.6] }],
        arrow: arrowAt(),
      }
    case 'block':
      return { parts: [{ points: [a.x, a.y, b.x, b.y] }, cap(b, ux, uy, unit * 0.9)] }
    case 'path':
      return { parts: [{ points: [a.x, a.y, b.x, b.y] }] }
    case 'motion':
      return { parts: [{ points: zigzag(a, b, unit * 0.35, unit * 1.2) }] }
    case 'segmentedBlock': {
      const mid: Pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      return {
        parts: [
          {
            points: [a.x, a.y, b.x, b.y],
            dash: [unit * 1.1, unit * 0.45, unit * 0.2, unit * 0.45],
          },
          cap(mid, ux, uy, unit * 0.5),
          cap(b, ux, uy, unit * 0.9),
        ],
      }
    }
    case 'checkRelease':
      return {
        parts: [{ points: [a.x, a.y, b.x, b.y], dash: [unit * 0.8, unit * 0.55] }],
        dot: { x: b.x, y: b.y, r: unit * 0.38 },
      }
  }
}

export interface FieldMark {
  /** 0..1 from the top. */
  y: number
  kind: 'yard' | 'goal'
  /** Number printed on the line, on the tens. */
  label?: number
}

export interface FieldView {
  marks: FieldMark[]
  /** 0..1 bands drawn as end zones. */
  endZones: { y0: number; y1: number }[]
}

/**
 * The field as seen from a preset: where the lines and numbers fall when the ball is on
 * that yard line. `yardLine` counts from our own goal line, 0 to 100.
 */
export function fieldView(preset: FieldPreset | null): FieldView {
  const spot = preset == null ? 25 : FIELD_PRESETS[preset].yardLine
  const perYard = 1 / VIEW_YARDS
  const at = (yard: number) => LOS_Y - (yard - spot) * perYard
  const marks: FieldMark[] = []
  const endZones: FieldView['endZones'] = []
  for (let yard = -10; yard <= 110; yard += 1) {
    const y = at(yard)
    if (y < -0.02 || y > 1.02) continue
    if (yard === 0 || yard === 100) marks.push({ y, kind: 'goal' })
    else if (yard > 0 && yard < 100 && yard % 5 === 0) {
      marks.push({
        y,
        kind: 'yard',
        ...(yard % 10 === 0 ? { label: Math.min(yard, 100 - yard) } : {}),
      })
    }
  }
  // Own end zone is everything below yard 0, the opponent's everything above yard 100.
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  endZones.push({ y0: clamp(at(0)), y1: 1 }, { y0: 0, y1: clamp(at(100)) })
  return { marks, endZones: endZones.filter((zone) => zone.y1 - zone.y0 > 0.001) }
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]
    const b = poly[j]
    if (a == null || b == null) continue
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function pointInRect(p: Pt, a: Pt, b: Pt): boolean {
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  )
}

/** Zoom levels the view offers. 1 is the whole field width. */
export const ZOOMS = [1, 1.25, 1.5, 2] as const

/** How the field is looked at. View only: none of it is saved in the diagram. */
export interface ViewState {
  width: number
  height: number
  zoom: number
  /** Mirror left and right. */
  flip: boolean
}

/** Where a zoomed Stage sits so the zoom holds the line of scrimmage and the middle in place. */
export function stagePlacement(v: ViewState): { x: number; y: number } {
  return { x: (v.width / 2) * (1 - v.zoom), y: LOS_Y * v.height * (1 - v.zoom) }
}

/** A diagram point (0..1) as pixels on screen, through flip and zoom. */
export function toScreen(p: Pt, v: ViewState): Pt {
  const x = v.flip ? 1 - p.x : p.x
  const place = stagePlacement(v)
  return { x: place.x + x * v.width * v.zoom, y: place.y + p.y * v.height * v.zoom }
}

/** A point on the Stage's own canvas (already past zoom) as a diagram point, undoing flip. */
export function fromStage(p: Pt, v: Pick<ViewState, 'width' | 'height' | 'flip'>): Pt {
  const x = p.x / v.width
  return { x: v.flip ? 1 - x : x, y: p.y / v.height }
}

/** Token radius in px for a field this wide. */
export function tokenRadius(width: number): number {
  // 26px across on a full-width canvas, like the reference; smaller only for thumbnails.
  return Math.min(13, Math.max(3, width * 0.019))
}
