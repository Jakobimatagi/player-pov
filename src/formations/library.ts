import type { LookPlayer, LookSource } from '../play/sourceTypes'
import type { Position } from '../play/types'

/**
 * Offensive formations a defense game-plans against, and the tags coaches sort them
 * by. Personnel and structure are read from where players line up, so a formation a
 * coach charts gets tagged the same way as the starter library.
 *
 * Coordinates are the look's own: `dx` is yards from the line (negative = backfield),
 * `dy` is yards toward the offense's left (positive = left of the ball).
 */

export type Personnel = `${0 | 1 | 2 | 3}${0 | 1 | 2 | 3 | 4}`

export type Structure = '1x1' | '2x1' | '2x2' | '3x1' | '3x2' | '4x1' | 'empty'

export interface FormationTags {
  personnel: Personnel
  structure: Structure
  backfield: 'gun' | 'pistol' | 'under center'
  /** Side with more receivers; `balanced` when even. Named from the offense's view. */
  strength: 'left' | 'right' | 'balanced'
}

export const PERSONNEL_LABEL = (personnel: string): string => `${personnel} personnel`

export const STRUCTURE_LABEL: Record<Structure, string> = {
  '1x1': '1x1',
  '2x1': '2x1',
  '2x2': '2x2',
  '3x1': '3x1 (trips)',
  '3x2': '3x2',
  '4x1': '4x1 (quads)',
  empty: 'Empty',
}

/** Detached from the core: anyone more than 4.5 yards from the ball, or a TE/WR on the line. */
function isReceiver(player: Pick<LookPlayer, 'position' | 'align'>): boolean {
  const { position } = player
  if (position === 'WR' || position === 'TE') return true
  if (position === 'RB' || position === 'FB') return Math.abs(player.align.dy) > 4.5
  return false
}

function backfield(players: readonly LookPlayer[]): FormationTags['backfield'] {
  const qb = players.find((player) => player.position === 'QB')
  if (qb == null || qb.align.dx > -3) return 'under center'
  const behind = players.some(
    (player) =>
      (player.position === 'RB' || player.position === 'FB') &&
      Math.abs(player.align.dy) < 0.6 &&
      player.align.dx < qb.align.dx,
  )
  return behind ? 'pistol' : 'gun'
}

/** Personnel, structure, backfield and strength from the alignment alone. */
export function detectTags(look: Pick<LookSource, 'players'>): FormationTags {
  const players = look.players
  const count = (positions: Position[]) =>
    players.filter((player) => positions.includes(player.position)).length
  const backs = count(['RB', 'FB'])
  const ends = count(['TE'])
  const personnel = `${Math.min(backs, 3)}${Math.min(ends, 4)}` as Personnel

  const receivers = players.filter((player) => isReceiver(player))
  const left = receivers.filter((player) => player.align.dy > 0.5).length
  const right = receivers.filter((player) => player.align.dy < -0.5).length
  const inBackfield = players.filter(
    (player) => (player.position === 'RB' || player.position === 'FB') && !isReceiver(player),
  ).length
  const wide = Math.max(left, right)
  const short = Math.min(left, right)
  let structure: Structure
  if (inBackfield === 0 && left + right >= 5) structure = 'empty'
  else if (wide >= 4) structure = '4x1'
  else if (wide === 3 && short >= 2) structure = '3x2'
  else if (wide === 3) structure = '3x1'
  else if (wide === 2 && short === 2) structure = '2x2'
  else if (wide === 2) structure = '2x1'
  else structure = '1x1'
  const strength = left === right ? 'balanced' : left > right ? 'left' : 'right'
  return { personnel, structure, backfield: backfield(players), strength }
}

/** "3x1 (trips) · 11 personnel · gun" */
export function tagSummary(tags: FormationTags): string {
  return `${STRUCTURE_LABEL[tags.structure]} · ${PERSONNEL_LABEL(tags.personnel)} · ${tags.backfield}`
}

type Spot = [slot: string, position: Position, jersey: number, dx: number, dy: number]

function formation(id: string, name: string, spots: Spot[]): LookSource {
  return {
    id,
    name,
    side: 'offense',
    players: spots.map(([slot, position, jersey, dx, dy]) => ({
      slot,
      position,
      jersey,
      face: 0,
      align: { dx, dy },
      legs: [],
    })),
  }
}

const LINE: Spot[] = [
  ['lt', 'LT', 76, -0.5, 4],
  ['lg', 'LG', 66, -0.5, 2],
  ['c', 'C', 64, -0.5, 0],
  ['rg', 'RG', 68, -0.5, -2],
  ['rt', 'RT', 72, -0.5, -4],
]

const GUN_QB: Spot = ['qb', 'QB', 12, -5, 0]
const UC_QB: Spot = ['qb', 'QB', 12, -1, 0]

/** Library ids are prefixed so they never collide with a team's scout look uuid. */
export const LIBRARY_PREFIX = 'lib:'

export const FORMATION_LIBRARY: readonly LookSource[] = [
  formation(`${LIBRARY_PREFIX}gun-spread`, 'Gun Spread', [
    ...LINE,
    GUN_QB,
    ['rb', 'RB', 28, -5, 2],
    ['x', 'WR', 1, -0.5, 18],
    ['h', 'WR', 11, -1, 10],
    ['y', 'TE', 88, -1, -10],
    ['z', 'WR', 4, -0.5, -18],
  ]),
  formation(`${LIBRARY_PREFIX}gun-trips-rt`, 'Gun Trips Right', [
    ...LINE,
    GUN_QB,
    ['rb', 'RB', 28, -5, 2],
    ['x', 'WR', 1, -0.5, 18],
    ['y', 'TE', 88, -1, -7],
    ['h', 'WR', 11, -1, -11],
    ['z', 'WR', 4, -0.5, -18],
  ]),
  formation(`${LIBRARY_PREFIX}gun-bunch-rt`, 'Gun Bunch Right', [
    ...LINE,
    GUN_QB,
    ['rb', 'RB', 28, -5, 2],
    ['x', 'WR', 1, -0.5, 18],
    ['y', 'TE', 88, -0.5, -9],
    ['h', 'WR', 11, -1.5, -8],
    ['z', 'WR', 4, -1.5, -10],
  ]),
  formation(`${LIBRARY_PREFIX}empty-3x2`, 'Empty 3x2', [
    ...LINE,
    GUN_QB,
    ['x', 'WR', 1, -0.5, 18],
    ['rb', 'RB', 28, -1, 9],
    ['y', 'WR', 88, -1, -7],
    ['h', 'WR', 11, -1, -12],
    ['z', 'WR', 4, -0.5, -18],
  ]),
  formation(`${LIBRARY_PREFIX}ace-12`, 'Ace Twins (12)', [
    ...LINE,
    GUN_QB,
    ['rb', 'RB', 28, -7, 0],
    ['f', 'TE', 85, -1, 6],
    ['x', 'WR', 1, -0.5, 17],
    ['y', 'TE', 88, -1, -6],
    ['z', 'WR', 4, -0.5, -17],
  ]),
  formation(`${LIBRARY_PREFIX}12-trips`, '12 Trips Right', [
    ...LINE,
    GUN_QB,
    ['rb', 'RB', 28, -5, 2],
    ['x', 'WR', 1, -0.5, 17],
    ['y', 'TE', 88, -1, -6],
    ['f', 'TE', 85, -1.5, -8],
    ['z', 'WR', 4, -0.5, -17],
  ]),
  formation(`${LIBRARY_PREFIX}heavy-13`, 'Heavy (13)', [
    ...LINE,
    UC_QB,
    ['rb', 'RB', 28, -7, 0],
    ['f', 'TE', 85, -1, 6],
    ['y', 'TE', 88, -1, -6],
    ['u', 'TE', 87, -1.5, -8],
    ['z', 'WR', 4, -0.5, -15],
  ]),
  formation(`${LIBRARY_PREFIX}i-pro-21`, 'I-Form Pro (21)', [
    ...LINE,
    UC_QB,
    ['fb', 'FB', 44, -4, 0],
    ['rb', 'RB', 28, -7, 0],
    ['x', 'WR', 1, -0.5, 15],
    ['y', 'TE', 88, -1, -6],
    ['z', 'WR', 4, -1, -15],
  ]),
]

export function findLibraryFormation(id: string): LookSource | undefined {
  return FORMATION_LIBRARY.find((look) => look.id === id)
}
