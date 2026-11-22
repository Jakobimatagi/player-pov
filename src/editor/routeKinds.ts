import type { Leg, RouteEnd, RouteKind } from '../play/sourceTypes'
import type { Position } from '../play/types'

/**
 * The diagram vocabulary, kept small on purpose: a player dot, a route line, a block tick
 * and a motion line. `path` is a plain line with no arrowhead.
 */
export const ROUTE_KINDS: readonly RouteKind[] = ['route', 'block', 'motion', 'path']

export const ROUTE_KIND_LABEL: Record<RouteKind, string> = {
  route: 'Route',
  block: 'Block',
  motion: 'Motion',
  path: 'Path',
}

export const ROUTE_ENDS: readonly RouteEnd[] = ['arrow', 'block', 'none']

export const ROUTE_END_LABEL: Record<RouteEnd, string> = {
  arrow: 'Arrow',
  block: 'Flat',
  none: 'None',
}

/** The end a line gets until the coach picks one: block lines end flat, paths end bare. */
export function defaultEnd(kind: RouteKind): RouteEnd {
  return kind === 'block' ? 'block' : kind === 'path' ? 'none' : 'arrow'
}

export function legEnd(leg: Pick<Leg, 'kind' | 'end'>): RouteEnd {
  return leg.end ?? defaultEnd(legKind(leg))
}

export function legKind(leg: Pick<Leg, 'kind'>): RouteKind {
  return leg.kind ?? 'route'
}

/** Offensive linemen: plain gray dots with a block cap, not a coloured skill dot. */
export function isLineman(position: Position): boolean {
  return (
    position === 'LT' ||
    position === 'LG' ||
    position === 'C' ||
    position === 'RG' ||
    position === 'RT'
  )
}

/** One colour per slot letter, so Z is the same colour in every play. */
const SLOT_COLORS: Record<string, string> = {
  x: '#e5534b',
  z: '#3b82f6',
  y: '#f0b429',
  h: '#a855f7',
  s: '#14b8a6',
  f: '#f97316',
  a: '#ec4899',
  b: '#84cc16',
  rb: '#22c55e',
  tb: '#22c55e',
  fb: '#22c55e',
  te: '#f0b429',
  qb: '#1c1c1c',
}

const POSITION_COLORS: Partial<Record<Position, string>> = {
  QB: '#1c1c1c',
  RB: '#22c55e',
  FB: '#22c55e',
  TE: '#f0b429',
  WR: '#3b82f6',
}

export const LINEMAN_COLOR = '#d6d3cb'
const FALLBACK_COLOR = '#f4f1ea'

export function playerColor(slot: string, position: Position): string {
  if (isLineman(position)) return LINEMAN_COLOR
  if (position === 'QB') return SLOT_COLORS.qb ?? FALLBACK_COLOR
  return SLOT_COLORS[slot.toLowerCase()] ?? POSITION_COLORS[position] ?? FALLBACK_COLOR
}

/** The QB's dropback line is black; every other line takes its player's colour. */
export function routeColor(slot: string, position: Position): string {
  return position === 'QB' ? '#0b0b0b' : playerColor(slot, position)
}

/** Text colour that reads on `fill`. */
export function onColor(fill: string): string {
  const hex = fill.replace('#', '')
  const n = Number.parseInt(hex, 16)
  const luma = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return luma > 0.6 ? '#141414' : '#ffffff'
}

/** Field-position presets. They move the view, not the play: all routes are ball-relative. */
export interface FieldPreset {
  id: string
  label: string
  /** PlaySource.ballSpot.yardLine: yards from the offense's own goal line. */
  yardLine: number
}

export const FIELD_PRESETS: readonly FieldPreset[] = [
  { id: 'play', label: 'As charted', yardLine: -1 },
  { id: 'midfield', label: 'Midfield', yardLine: 50 },
  { id: 'redzone', label: 'Redzone', yardLine: 85 },
  { id: 'goalline', label: 'Goalline', yardLine: 97 },
  { id: 'backed-up', label: 'Backed up', yardLine: 5 },
]

/** Default circle text for a player with no mark of its own. */
export function markOf(slot: string, position: Position, side: 'ours' | 'theirs'): string {
  if (side === 'ours') return slot.length <= 2 ? slot.toUpperCase() : position
  if (position === 'LB') return slot.charAt(0).toUpperCase()
  if (position === 'S') return slot.slice(0, 2).toUpperCase()
  return position
}
