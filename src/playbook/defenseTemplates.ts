import { findLibraryFormation, LIBRARY_PREFIX } from '../formations/library'
import type { DefenderAnchor, Leg, PlaySource, SourcePlayer } from '../play/sourceTypes'
import type { Position } from '../play/types'
import type { NewPlay } from './newPlays'

/**
 * Starter defensive calls. Every defender is anchored (to a receiver, or to the ball set
 * to the strength) so the call re-aligns against whatever formation it faces. With an
 * anchor other than `ball`, sideways yards (`dy`) mean *outside*, toward that side.
 */

type Spot = {
  slot: string
  position: Position
  jersey: number
  anchor: DefenderAnchor
  dx: number
  dy: number
  /** Drop or rush: [downfield, outside, seconds] per leg. */
  legs: [number, number, number][]
}

export interface DefenseCall {
  name: string
  description: string
  coverage: string
  spots: Spot[]
}

export interface DefenseTemplate {
  id: string
  name: string
  summary: string
  side: 'defense'
  /** Library formation each play is charted against first. */
  formation: string
  plays: readonly DefenseCall[]
}

const RUSH: [number, number, number][] = [[-4, 0, 1.4]]

/** The 4-3 Over front, set to the strength. Shared by every call below. */
const FRONT: Spot[] = [
  { slot: 'de_s', position: 'DE', jersey: 90, anchor: 'strong', dx: 1, dy: 5, legs: RUSH },
  { slot: 'dt_s', position: 'DT', jersey: 93, anchor: 'strong', dx: 1, dy: 1, legs: RUSH },
  { slot: 'dt_w', position: 'DT', jersey: 97, anchor: 'weak', dx: 1, dy: 2.5, legs: RUSH },
  { slot: 'de_w', position: 'DE', jersey: 95, anchor: 'weak', dx: 1, dy: 5, legs: RUSH },
]

export const DEFENSE_TEMPLATES: readonly DefenseTemplate[] = [
  {
    id: 'base-43',
    name: 'Base 4-3 Coverages',
    summary: '4-3 Over. Cover 3 Sky, Cover 2 and Cover 1 Robber, each aligned to the strength.',
    side: 'defense',
    formation: `${LIBRARY_PREFIX}gun-spread`,
    plays: [
      {
        name: 'Cover 3 Sky',
        coverage: 'Cover 3',
        description:
          'Three deep, four under. The strong safety rolls down to the curl/flat; the free safety takes the deep middle.',
        spots: [
          ...FRONT,
          {
            slot: 'sam',
            position: 'LB',
            jersey: 54,
            anchor: 'strong#2',
            dx: 4,
            dy: -1.5,
            legs: [[5, 2, 1.8]],
          },
          {
            slot: 'mike',
            position: 'LB',
            jersey: 55,
            anchor: 'strong',
            dx: 5,
            dy: 1,
            legs: [[6, 0, 1.8]],
          },
          {
            slot: 'will',
            position: 'LB',
            jersey: 58,
            anchor: 'weak',
            dx: 4.5,
            dy: 3.5,
            legs: [[5, 3, 1.8]],
          },
          {
            slot: 'cb_s',
            position: 'CB',
            jersey: 21,
            anchor: 'strong#1',
            dx: 7,
            dy: -1,
            legs: [[9, 1, 2.2]],
          },
          {
            slot: 'cb_w',
            position: 'CB',
            jersey: 24,
            anchor: 'weak#1',
            dx: 7,
            dy: -1,
            legs: [[9, 1, 2.2]],
          },
          {
            slot: 'ss',
            position: 'S',
            jersey: 2,
            anchor: 'strong#2',
            dx: 7,
            dy: 1,
            legs: [[3, 3, 1.6]],
          },
          {
            slot: 'fs',
            position: 'S',
            jersey: 8,
            anchor: 'ball',
            dx: 12,
            dy: 0,
            legs: [[5, 0, 2.2]],
          },
        ],
      },
      {
        name: 'Cover 2',
        coverage: 'Cover 2',
        description:
          'Two deep halves, five under. Corners squat in the flats and re-route #1; safeties split the field.',
        spots: [
          ...FRONT,
          {
            slot: 'sam',
            position: 'LB',
            jersey: 54,
            anchor: 'strong#2',
            dx: 4,
            dy: -1.5,
            legs: [[6, 1, 1.8]],
          },
          {
            slot: 'mike',
            position: 'LB',
            jersey: 55,
            anchor: 'strong',
            dx: 5,
            dy: 1,
            legs: [[8, 0, 2]],
          },
          {
            slot: 'will',
            position: 'LB',
            jersey: 58,
            anchor: 'weak',
            dx: 4.5,
            dy: 3.5,
            legs: [[6, 1, 1.8]],
          },
          {
            slot: 'cb_s',
            position: 'CB',
            jersey: 21,
            anchor: 'strong#1',
            dx: 5,
            dy: -1,
            legs: [[2, 3, 1.4]],
          },
          {
            slot: 'cb_w',
            position: 'CB',
            jersey: 24,
            anchor: 'weak#1',
            dx: 5,
            dy: -1,
            legs: [[2, 3, 1.4]],
          },
          {
            slot: 'ss',
            position: 'S',
            jersey: 2,
            anchor: 'strong',
            dx: 12,
            dy: 9,
            legs: [[6, 2, 2.2]],
          },
          {
            slot: 'fs',
            position: 'S',
            jersey: 8,
            anchor: 'weak',
            dx: 12,
            dy: 9,
            legs: [[6, 2, 2.2]],
          },
        ],
      },
      {
        name: 'Cover 1 Robber',
        coverage: 'Cover 1',
        description:
          'Man free. Corners press #1, Sam takes #2 strong, the free safety is the post and the strong safety robs the middle.',
        spots: [
          ...FRONT,
          {
            slot: 'sam',
            position: 'LB',
            jersey: 54,
            anchor: 'strong#2',
            dx: 2,
            dy: -1,
            legs: [[8, 0, 2]],
          },
          {
            slot: 'mike',
            position: 'LB',
            jersey: 55,
            anchor: 'strong',
            dx: 5,
            dy: 1,
            legs: [[-3, 0, 1.2]],
          },
          {
            slot: 'will',
            position: 'LB',
            jersey: 58,
            anchor: 'weak',
            dx: 4.5,
            dy: 3.5,
            legs: [[2, 4, 1.6]],
          },
          {
            slot: 'cb_s',
            position: 'CB',
            jersey: 21,
            anchor: 'strong#1',
            dx: 1,
            dy: -1,
            legs: [[10, 0, 2.2]],
          },
          {
            slot: 'cb_w',
            position: 'CB',
            jersey: 24,
            anchor: 'weak#1',
            dx: 1,
            dy: -1,
            legs: [[10, 0, 2.2]],
          },
          {
            slot: 'ss',
            position: 'S',
            jersey: 2,
            anchor: 'strong',
            dx: 9,
            dy: 2,
            legs: [[3, -2, 1.6]],
          },
          {
            slot: 'fs',
            position: 'S',
            jersey: 8,
            anchor: 'ball',
            dx: 13,
            dy: 0,
            legs: [[4, 0, 2.2]],
          },
        ],
      },
    ],
  },
]

const DURATION = 3
const SNAP_SECONDS = 0.35

function legsOf(spot: Spot): Leg[] {
  return spot.legs.map(([dx, dy, dur]) => ({ to: { dx, dy }, dur }))
}

/** One call against the template's starting formation. */
export function buildDefensePlay(template: DefenseTemplate, call: DefenseCall): NewPlay {
  const look = findLibraryFormation(template.formation)
  if (look == null) throw new Error(`unknown formation ${template.formation}`)
  const players: SourcePlayer[] = call.spots.map((spot) => ({
    slot: spot.slot,
    position: spot.position,
    jersey: spot.jersey,
    face: 180,
    anchor: spot.anchor,
    align: { dx: spot.dx, dy: spot.dy },
    legs: legsOf(spot),
  }))
  const source: PlaySource = {
    sourceVersion: 1,
    name: call.name,
    side: 'defense',
    formation: '4-3 Over',
    description: call.description,
    ballSpot: { yardLine: 25, hash: 'M' },
    duration: DURATION,
    players,
    defaultLookId: look.id,
    ball: {
      snap: 'shotgun',
      segments: [
        { kind: 'flight', t0: 0, t1: SNAP_SECONDS, from: 'c', to: 'qb', apex: 0.3 },
        { kind: 'carried', t0: SNAP_SECONDS, t1: DURATION, carrier: 'qb' },
      ],
    },
    adjustments: [],
  }
  return { source, look }
}

export function findDefenseTemplate(id: string): DefenseTemplate | undefined {
  return DEFENSE_TEMPLATES.find((template) => template.id === id)
}

export function buildDefenseBook(id: string): NewPlay[] {
  const template = findDefenseTemplate(id)
  if (template == null) throw new Error(`unknown playbook ${id}`)
  return template.plays.map((call) => buildDefensePlay(template, call))
}
