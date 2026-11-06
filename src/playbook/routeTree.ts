import type { Leg, SourcePlayer } from '../play/sourceTypes'

/**
 * The route tree, plus the backfield and line jobs a generated play needs.
 * Legs are relative moves in yards, as in `PlaySource`: `dx` is downfield and
 * `dy` is toward the offense's left. A route is written with `out` toward the
 * receiver's own sideline, and `buildRoute` turns that into `dy` for the side
 * the player lines up on.
 */
export const ROUTE_IDS = [
  'hitch',
  'slant',
  'flat',
  'out',
  'quick-out',
  'dig',
  'curl',
  'comeback',
  'corner',
  'post',
  'go',
  'seam',
  'drag',
  'mesh',
  'in',
  'stick',
  'wheel',
  'swing',
  'check-flat',
  'pass-pro',
  'qb-drop',
  'qb-drop-3',
] as const

export type RouteId = (typeof ROUTE_IDS)[number]

interface Step {
  up: number
  out: number
  label?: string
  /** A sharp cut at the end of the step. Defaults to true. */
  sharp?: boolean
}

interface RouteDef {
  name: string
  steps: Step[]
  /** Yards per second. Receivers run at the player's default unless set. */
  speed?: number
}

const ROUTES: Readonly<Record<RouteId, RouteDef>> = {
  hitch: {
    name: 'Hitch',
    steps: [
      { up: 6, out: 0, label: 'stem' },
      { up: -1, out: -0.5, label: 'hitch' },
    ],
  },
  slant: {
    name: 'Slant',
    steps: [
      { up: 2, out: 0, label: 'stem' },
      { up: 5, out: -5, label: 'slant' },
    ],
  },
  flat: {
    name: 'Flat',
    steps: [
      { up: 2, out: 2, label: 'release', sharp: false },
      { up: 1, out: 6, label: 'flat' },
    ],
  },
  out: {
    name: 'Out',
    steps: [
      { up: 10, out: 0, label: 'stem' },
      { up: 0, out: 6, label: 'out' },
    ],
  },
  'quick-out': {
    name: 'Quick out',
    steps: [
      { up: 5, out: 0, label: 'stem' },
      { up: 0, out: 5, label: 'out' },
    ],
  },
  dig: {
    name: 'Dig',
    steps: [
      { up: 12, out: 0, label: 'stem' },
      { up: 0, out: -10, label: 'dig' },
    ],
  },
  curl: {
    name: 'Curl',
    steps: [
      { up: 12, out: 0, label: 'stem' },
      { up: -2, out: -1.5, label: 'curl' },
    ],
  },
  comeback: {
    name: 'Comeback',
    steps: [
      { up: 15, out: 0, label: 'stem' },
      { up: -3, out: 2, label: 'comeback' },
    ],
  },
  corner: {
    name: 'Corner',
    steps: [
      { up: 10, out: 0, label: 'stem' },
      { up: 8, out: 7, label: 'corner' },
    ],
  },
  post: {
    name: 'Post',
    steps: [
      { up: 10, out: 0, label: 'stem' },
      { up: 10, out: -7, label: 'post' },
    ],
  },
  go: {
    name: 'Go',
    steps: [
      { up: 6, out: 0.5, label: 'release', sharp: false },
      { up: 18, out: 0, label: 'go' },
    ],
  },
  seam: {
    name: 'Seam',
    steps: [
      { up: 6, out: -1, label: 'release', sharp: false },
      { up: 16, out: 0, label: 'seam' },
    ],
  },
  drag: {
    name: 'Drag',
    steps: [
      { up: 2, out: -2, label: 'release', sharp: false },
      { up: 0, out: -14, label: 'drag' },
    ],
  },
  mesh: {
    name: 'Mesh',
    steps: [
      { up: 5, out: -2, label: 'release', sharp: false },
      { up: 0, out: -14, label: 'mesh' },
    ],
  },
  in: {
    name: 'In',
    steps: [
      { up: 6, out: 0, label: 'stem' },
      { up: 0, out: -7, label: 'in' },
    ],
  },
  stick: {
    name: 'Stick',
    steps: [
      { up: 6, out: 0, label: 'stem' },
      { up: 0, out: -1, label: 'sit' },
    ],
  },
  wheel: {
    name: 'Wheel',
    steps: [
      { up: 1, out: 5, label: 'flat', sharp: false },
      { up: 3, out: 2, label: 'turn', sharp: false },
      { up: 16, out: 0, label: 'wheel' },
    ],
  },
  swing: {
    name: 'Swing',
    steps: [
      { up: -1, out: 3, label: 'swing', sharp: false },
      { up: 1, out: 5, label: 'flat' },
    ],
  },
  'check-flat': {
    name: 'Check, then flat',
    steps: [
      { up: 0, out: 0.5, label: 'check' },
      { up: 1, out: 5, label: 'flat' },
    ],
    speed: 5,
  },
  'pass-pro': {
    name: 'Pass pro',
    steps: [{ up: -1.5, out: 0, label: 'set' }],
    speed: 1.5,
  },
  'qb-drop': {
    name: 'Drop',
    steps: [{ up: -2, out: 0, label: 'drop' }],
    speed: 3,
  },
  'qb-drop-3': {
    name: 'Three-step drop',
    steps: [{ up: -4, out: 0, label: 'drop' }],
    speed: 4,
  },
}

/** Default yards per second by position, the editor's DEFAULT_SPEED for receivers. */
const POSITION_SPEED: Partial<Record<SourcePlayer['position'], number>> = {
  WR: 7,
  RB: 6.5,
  FB: 5.5,
  TE: 6,
  QB: 3,
}

export function routeName(id: RouteId): string {
  return ROUTES[id].name
}

/** +1 when the player's sideline is the offense's left (+dy), else -1. */
export function outsideSign(alignDy: number): 1 | -1 {
  return alignDy > 0 ? 1 : -1
}

/** The legs for `route` run by `player`, mirrored to the side the player lines up on. */
export function buildRoute(
  route: RouteId,
  player: Pick<SourcePlayer, 'position' | 'align'>,
): Leg[] {
  const def = ROUTES[route]
  const sign = outsideSign(player.align.dy)
  const speed = def.speed ?? POSITION_SPEED[player.position] ?? 5
  return def.steps.map((step) => {
    const leg: Leg = {
      to: { dx: step.up, dy: step.out * sign + 0 },
      speed,
    }
    if (step.sharp !== false) leg.interp = 'linear'
    if (step.label != null) leg.label = step.label
    return leg
  })
}

/** Seconds a set of legs takes, matching compileSource's leg timing. */
export function legsSeconds(legs: readonly Leg[]): number {
  let total = 0
  for (const leg of legs) {
    if (leg.dur != null) total += leg.dur
    else if (leg.speed != null && leg.speed > 0)
      total += Math.hypot(leg.to.dx, leg.to.dy) / leg.speed
  }
  return total
}
