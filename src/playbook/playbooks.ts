import { FORMATIONS } from '../editor/formations'
import { COVER_2_LOOK, COVER_3_LOOK } from '../play/cover2Look'
import type { BallSegment } from '../play/types'
import type { LookSource, PlaySource, SourcePlayer } from '../play/sourceTypes'
import type { NewPlay } from './newPlays'
import { buildRoute, legsSeconds, type RouteId } from './routeTree'

/** Which route each slot runs. Slots not listed keep their legs. */
export type RouteMap = Readonly<Partial<Record<string, RouteId>>>

/** Gives each listed slot the legs of its route. Pure: returns a new source. */
export function applyRoutes(source: PlaySource, routes: RouteMap): PlaySource {
  return {
    ...source,
    players: source.players.map((player) => {
      const route = routes[player.slot]
      return route == null ? player : { ...player, legs: buildRoute(route, player) }
    }),
  }
}

export interface PlaySpec {
  name: string
  description: string
  routes: RouteMap
  /** The slot the QB throws to, and when the ball leaves his hand (seconds after the snap). */
  throwTo: string
  throwAt: number
  look: 'cover-2' | 'cover-3'
}

export interface PlaybookTemplate {
  id: string
  name: string
  summary: string
  /** A key of FORMATIONS for our side. */
  formation: string
  plays: readonly PlaySpec[]
}

const LOOKS: Readonly<Record<PlaySpec['look'], LookSource>> = {
  'cover-2': COVER_2_LOOK,
  'cover-3': COVER_3_LOOK,
}

const LINE_SLOTS = ['lt', 'lg', 'c', 'rg', 'rt'] as const
const SNAP_SECONDS = 0.35
const FLIGHT_SECONDS = 0.7
const AFTER_CATCH = 0.6

export const PLAYBOOK_TEMPLATES: readonly PlaybookTemplate[] = [
  {
    id: 'spread',
    name: 'Spread Air Raid',
    summary: 'Gun Spread 2x2. Four Verticals, Mesh, Stick, Smash and Levels.',
    formation: 'gun-spread',
    plays: [
      {
        name: 'Four Verticals',
        description:
          'All four receivers stretch the deep zones. Read the seams against the middle safety.',
        routes: { x: 'go', h: 'seam', y: 'seam', z: 'go', rb: 'check-flat' },
        throwTo: 'h',
        throwAt: 2.3,
        look: 'cover-3',
      },
      {
        name: 'Mesh',
        description: 'H and Y cross underneath, rubbing man coverage. X and Z clear deep.',
        routes: { x: 'post', h: 'drag', y: 'mesh', z: 'corner', rb: 'check-flat' },
        throwTo: 'h',
        throwAt: 1.7,
        look: 'cover-2',
      },
      {
        name: 'Stick',
        description:
          'H sits at 6 yards while the back runs the flat. Quick read of the flat defender.',
        routes: { x: 'go', h: 'stick', y: 'seam', z: 'slant', rb: 'flat' },
        throwTo: 'h',
        throwAt: 1.3,
        look: 'cover-3',
      },
      {
        name: 'Smash',
        description: 'Outside hitches with slot corners over the top. Beats Cover 2 corners.',
        routes: { x: 'hitch', h: 'corner', y: 'corner', z: 'hitch', rb: 'check-flat' },
        throwTo: 'h',
        throwAt: 2.0,
        look: 'cover-2',
      },
      {
        name: 'Levels',
        description: 'X digs at 12 over H at 6. High-low the hook defenders.',
        routes: { x: 'dig', h: 'in', y: 'seam', z: 'go', rb: 'check-flat' },
        throwTo: 'x',
        throwAt: 2.2,
        look: 'cover-3',
      },
    ],
  },
  {
    id: 'west-coast',
    name: 'West Coast',
    summary:
      'Pro Right Slot, under center. Slant-Flat, Drive, Curl-Flat, Y-Corner and Quick Stick.',
    formation: 'pro-rt',
    plays: [
      {
        name: 'Slant-Flat',
        description: 'Z slants under H in the flat. Throw off the flat defender.',
        routes: { x: 'slant', h: 'flat', y: 'seam', z: 'slant', rb: 'check-flat' },
        throwTo: 'z',
        throwAt: 1.1,
        look: 'cover-3',
      },
      {
        name: 'Drive',
        description: 'H drags under Z’s dig. Shallow to dig on the linebacker.',
        routes: { x: 'go', h: 'drag', y: 'check-flat', z: 'dig', rb: 'check-flat' },
        throwTo: 'h',
        throwAt: 1.8,
        look: 'cover-2',
      },
      {
        name: 'Curl-Flat',
        description: 'Curls outside, H in the flat. Read the curl-flat defender.',
        routes: { x: 'curl', h: 'flat', y: 'seam', z: 'curl', rb: 'check-flat' },
        throwTo: 'z',
        throwAt: 2.0,
        look: 'cover-3',
      },
      {
        name: 'Y-Corner',
        description: 'Y breaks to the corner behind H in the flat. Z posts to hold the safety.',
        routes: { x: 'dig', h: 'flat', y: 'corner', z: 'post', rb: 'check-flat' },
        throwTo: 'y',
        throwAt: 2.4,
        look: 'cover-2',
      },
      {
        name: 'Quick Stick',
        description: 'Y sits at 6 with H in the flat. The back swings away.',
        routes: { x: 'slant', h: 'flat', y: 'stick', z: 'go', rb: 'swing' },
        throwTo: 'y',
        throwAt: 1.3,
        look: 'cover-3',
      },
    ],
  },
  {
    id: 'trips',
    name: 'Trips Package',
    summary: 'Gun Trips Right. Flood, Trips Verticals and Trips Stick.',
    formation: 'trips-rt',
    plays: [
      {
        name: 'Trips Flood',
        description: 'Three levels to the trips side: Z deep, H corner, Y flat.',
        routes: { x: 'dig', h: 'corner', y: 'flat', z: 'go', rb: 'check-flat' },
        throwTo: 'h',
        throwAt: 2.2,
        look: 'cover-3',
      },
      {
        name: 'Trips Verticals',
        description: 'Everyone vertical. Y bends the seam against the middle of the field.',
        routes: { x: 'go', h: 'seam', y: 'seam', z: 'go', rb: 'check-flat' },
        throwTo: 'y',
        throwAt: 2.2,
        look: 'cover-2',
      },
      {
        name: 'Trips Stick',
        description: 'H sits, Y runs the flat, Z clears. X slants on the back side.',
        routes: { x: 'slant', h: 'stick', y: 'flat', z: 'go', rb: 'check-flat' },
        throwTo: 'h',
        throwAt: 1.3,
        look: 'cover-3',
      },
    ],
  },
]

function roundUpHalf(v: number): number {
  return Math.ceil(v * 2) / 2
}

/** One play of a template: formation, routes, line and QB jobs, and the ball path. */
export function buildTemplatePlay(template: PlaybookTemplate, spec: PlaySpec): NewPlay {
  const formation = FORMATIONS[template.formation]
  if (formation == null || formation.side !== 'ours') {
    throw new Error(`unknown offense formation ${template.formation}`)
  }
  const underCenter = formation.players.some((spot) => spot.slot === 'qb' && spot.align.dx > -3)
  const players: SourcePlayer[] = formation.players.map((spot) => ({
    slot: spot.slot,
    position: spot.position,
    ...(spot.jersey != null ? { jersey: spot.jersey } : {}),
    align: { dx: spot.align.dx, dy: spot.align.dy },
    legs: [],
  }))
  const jobs: Record<string, RouteId> = { qb: underCenter ? 'qb-drop-3' : 'qb-drop' }
  for (const slot of LINE_SLOTS) jobs[slot] = 'pass-pro'
  const base: PlaySource = {
    sourceVersion: 1,
    name: spec.name,
    side: 'offense',
    formation: formation.name,
    description: spec.description,
    ballSpot: { yardLine: 25, hash: 'M' },
    duration: 1,
    players,
    defaultLookId: spec.look,
    ball: { snap: underCenter ? 'under-center' : 'shotgun', segments: [] },
    adjustments: [],
  }
  const routed = applyRoutes(base, { ...jobs, ...spec.routes })
  const routeEnd = Math.max(...routed.players.map((player) => legsSeconds(player.legs)))
  const caught = spec.throwAt + FLIGHT_SECONDS
  const duration = roundUpHalf(Math.max(routeEnd, caught + AFTER_CATCH, 3))
  const segments: BallSegment[] = [
    { kind: 'flight', t0: 0, t1: SNAP_SECONDS, from: 'c', to: 'qb', apex: underCenter ? 0 : 0.3 },
    { kind: 'carried', t0: SNAP_SECONDS, t1: spec.throwAt, carrier: 'qb' },
    { kind: 'flight', t0: spec.throwAt, t1: caught, from: 'qb', to: spec.throwTo, apex: 2 },
    { kind: 'carried', t0: caught, t1: duration, carrier: spec.throwTo },
  ]
  return {
    source: {
      ...routed,
      duration,
      ball: { ...routed.ball, segments },
    },
    look: LOOKS[spec.look],
  }
}

export function findTemplate(id: string): PlaybookTemplate | undefined {
  return PLAYBOOK_TEMPLATES.find((template) => template.id === id)
}

/** Every play of the template, in order, ready for `createPlay`. */
export function buildPlaybook(id: string): NewPlay[] {
  const template = findTemplate(id)
  if (template == null) throw new Error(`unknown playbook ${id}`)
  return template.plays.map((spec) => buildTemplatePlay(template, spec))
}
