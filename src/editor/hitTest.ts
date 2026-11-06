import type { FieldConfig } from '../field/fieldConfig'
import { FIELD_LENGTH, FIELD_WIDTH } from '../play/coords'
import {
  chartLayout,
  type ChartLayout,
  type EditorState,
  type LegRef,
  type PlayerRef,
} from './state'

/**
 * Screen ↔ field mapping. `scale` is px per yard; `originX/originY` is the screen px of the
 * field's top-left corner as drawn. rotate 0 = landscape, offense moving right (+x), the
 * offense's left (+y) up. rotate 90 = portrait tablet, offense moving up.
 */
export interface View {
  scale: number
  originX: number
  originY: number
  rotate: 0 | 90
}

/** 44px target diameter, independent of zoom. */
export const HIT_RADIUS_PX = 22

export type Hit =
  | { kind: 'player'; ref: PlayerRef }
  | { kind: 'waypoint'; ref: LegRef }
  | { kind: 'segment'; ref: LegRef; t: number }
  | { kind: 'field'; x: number; y: number }

export function fieldToScreen(x: number, y: number, v: View): { px: number; py: number } {
  if (v.rotate === 90) {
    return {
      px: v.originX + (FIELD_WIDTH - y) * v.scale,
      py: v.originY + (FIELD_LENGTH - x) * v.scale,
    }
  }
  return { px: v.originX + x * v.scale, py: v.originY + (FIELD_WIDTH - y) * v.scale }
}

export function screenToField(px: number, py: number, v: View): { x: number; y: number } {
  if (v.rotate === 90) {
    return {
      x: FIELD_LENGTH - (py - v.originY) / v.scale,
      y: FIELD_WIDTH - (px - v.originX) / v.scale,
    }
  }
  return { x: (px - v.originX) / v.scale, y: FIELD_WIDTH - (py - v.originY) / v.scale }
}

/**
 * Fit a window of the field (absolute yards along x) into a w×h px box, centred on it.
 * The full field width is always shown.
 */
export function fitView(
  width: number,
  height: number,
  window: { x0: number; x1: number },
  rotate: 0 | 90 = 0,
): View {
  const length = window.x1 - window.x0
  const along = rotate === 90 ? height : width
  const across = rotate === 90 ? width : height
  const scale = Math.max(1e-6, Math.min(along / length, across / FIELD_WIDTH))
  if (rotate === 90) {
    // Screen top is x1, so the field's top-left (x = FIELD_LENGTH) sits above the box.
    const originY = (height - length * scale) / 2 - (FIELD_LENGTH - window.x1) * scale
    const originX = (width - FIELD_WIDTH * scale) / 2
    return { scale, originX, originY, rotate }
  }
  const originX = (width - length * scale) / 2 - window.x0 * scale
  const originY = (height - FIELD_WIDTH * scale) / 2
  return { scale, originX, originY, rotate }
}

function closestOnSegment(
  px: number,
  py: number,
  a: { px: number; py: number },
  b: { px: number; py: number },
): { d: number; t: number } {
  const ex = b.px - a.px
  const ey = b.py - a.py
  const len2 = ex * ex + ey * ey
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - a.px) * ex + (py - a.py) * ey) / len2)) : 0
  return { d: Math.hypot(px - (a.px + t * ex), py - (a.py + t * ey)), t }
}

/**
 * What a pointer at (px, py) lands on. Priority: waypoint > player > segment > field.
 * Within a kind the nearest target wins, so in a crowded box the nearer player is picked.
 * All distances are in screen px, so the 44px target holds at every zoom.
 */
export function hitTest(
  s: Pick<EditorState, 'source' | 'look'>,
  px: number,
  py: number,
  v: View,
  config?: FieldConfig,
  layout: ChartLayout = chartLayout(s, config),
): Hit {
  let waypoint: { d: number; ref: LegRef } | null = null
  let player: { d: number; ref: PlayerRef } | null = null
  let segment: { d: number; ref: LegRef; t: number } | null = null
  for (const p of layout.players) {
    const screen = p.points.map((point) => fieldToScreen(point.x, point.y, v))
    for (let index = 0; index < screen.length; index += 1) {
      const point = screen[index]
      if (point == null) continue
      const d = Math.hypot(px - point.px, py - point.py)
      if (d > HIT_RADIUS_PX) continue
      if (index === 0) {
        if (player == null || d < player.d) player = { d, ref: p.ref }
      } else if (waypoint == null || d < waypoint.d) {
        waypoint = { d, ref: { ...p.ref, leg: index - 1 } }
      }
    }
    for (let leg = 0; leg + 1 < screen.length; leg += 1) {
      const a = screen[leg]
      const b = screen[leg + 1]
      if (a == null || b == null) continue
      const hit = closestOnSegment(px, py, a, b)
      if (hit.d > HIT_RADIUS_PX) continue
      if (segment == null || hit.d < segment.d)
        segment = { d: hit.d, ref: { ...p.ref, leg }, t: hit.t }
    }
  }
  if (waypoint != null) return { kind: 'waypoint', ref: waypoint.ref }
  if (player != null) return { kind: 'player', ref: player.ref }
  if (segment != null) return { kind: 'segment', ref: segment.ref, t: segment.t }
  return { kind: 'field', ...screenToField(px, py, v) }
}
