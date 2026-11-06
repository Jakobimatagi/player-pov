import { COVER_2_LOOK } from '../play/cover2Look'
import type { LookAlign } from '../play/sourceTypes'
import type { Position } from '../play/types'
import type { SideKey } from './state'

export interface FormationSpot {
  slot: string
  position: Position
  jersey?: number
  face?: number
  align: LookAlign
}

export interface Formation {
  side: SideKey
  name: string
  players: FormationSpot[]
}

/** Gun Trips Right, the alignments of fixtures/trips-flood.source.json. */
const TRIPS_RT: Formation = {
  side: 'ours',
  name: 'Gun Trips Right',
  players: [
    { slot: 'lt', position: 'LT', jersey: 76, align: { dx: -0.5, dy: 4 } },
    { slot: 'lg', position: 'LG', jersey: 66, align: { dx: -0.5, dy: 2 } },
    { slot: 'c', position: 'C', jersey: 64, align: { dx: -0.5, dy: 0 } },
    { slot: 'rg', position: 'RG', jersey: 68, align: { dx: -0.5, dy: -2 } },
    { slot: 'rt', position: 'RT', jersey: 72, align: { dx: -0.5, dy: -4 } },
    { slot: 'qb', position: 'QB', jersey: 12, align: { dx: -5, dy: 0 } },
    { slot: 'rb', position: 'RB', jersey: 28, align: { dx: -6, dy: -1 } },
    { slot: 'x', position: 'WR', jersey: 1, align: { dx: -1, dy: 14 } },
    { slot: 'z', position: 'WR', jersey: 4, align: { dx: -1, dy: -16 } },
    { slot: 'h', position: 'WR', jersey: 11, align: { dx: -1, dy: -8 } },
    { slot: 'y', position: 'TE', jersey: 88, align: { dx: -0.5, dy: -6 } },
  ],
}

const LINE: FormationSpot[] = [
  { slot: 'lt', position: 'LT', jersey: 76, align: { dx: -0.5, dy: 4 } },
  { slot: 'lg', position: 'LG', jersey: 66, align: { dx: -0.5, dy: 2 } },
  { slot: 'c', position: 'C', jersey: 64, align: { dx: -0.5, dy: 0 } },
  { slot: 'rg', position: 'RG', jersey: 68, align: { dx: -0.5, dy: -2 } },
  { slot: 'rt', position: 'RT', jersey: 72, align: { dx: -0.5, dy: -4 } },
]

/** Gun Spread, a 2x2: a flexed Y in the right slot, the back offset beside the QB. */
const GUN_SPREAD: Formation = {
  side: 'ours',
  name: 'Gun Spread',
  players: [
    ...LINE,
    { slot: 'qb', position: 'QB', jersey: 12, align: { dx: -5, dy: 0 } },
    { slot: 'rb', position: 'RB', jersey: 28, align: { dx: -5, dy: 2 } },
    { slot: 'x', position: 'WR', jersey: 1, align: { dx: -0.5, dy: 16 } },
    { slot: 'h', position: 'WR', jersey: 11, align: { dx: -1, dy: 9 } },
    { slot: 'y', position: 'TE', jersey: 88, align: { dx: -1, dy: -9 } },
    { slot: 'z', position: 'WR', jersey: 4, align: { dx: -0.5, dy: -16 } },
  ],
}

/** Pro Right Slot, under center: Y attached right, tight splits, a single back. */
const PRO_RT: Formation = {
  side: 'ours',
  name: 'Pro Right Slot',
  players: [
    ...LINE,
    { slot: 'qb', position: 'QB', jersey: 12, align: { dx: -1, dy: 0 } },
    { slot: 'rb', position: 'RB', jersey: 28, align: { dx: -7, dy: 0 } },
    { slot: 'x', position: 'WR', jersey: 1, align: { dx: -0.5, dy: 12 } },
    { slot: 'y', position: 'TE', jersey: 88, align: { dx: -0.5, dy: -6 } },
    { slot: 'h', position: 'WR', jersey: 11, align: { dx: -1, dy: -9 } },
    { slot: 'z', position: 'WR', jersey: 4, align: { dx: -1, dy: -14 } },
  ],
}

const COVER_2: Formation = {
  side: 'theirs',
  name: COVER_2_LOOK.name,
  players: COVER_2_LOOK.players.map(({ slot, position, jersey, face, align }) => ({
    slot,
    position,
    ...(jersey != null ? { jersey } : {}),
    ...(face != null ? { face } : {}),
    align,
  })),
}

/** The preset registry. C6 adds the picker and more presets. */
export const FORMATIONS: Readonly<Record<string, Formation>> = {
  'trips-rt': TRIPS_RT,
  'gun-spread': GUN_SPREAD,
  'pro-rt': PRO_RT,
  'cover-2': COVER_2,
}
