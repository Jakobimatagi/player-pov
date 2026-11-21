import type { Side, TeamRole } from '../data/database.types'

export const SIDE_LABEL: Record<Side, string> = { offense: 'Offense', defense: 'Defense' }

/**
 * Mirrors app.can_edit_side in the database. Head coach edits both sides, a coordinator
 * edits their own side, a coach with no side edits both, players edit nothing. A null
 * `side` is a shared book any staff can edit.
 */
export function canEditSide(
  role: TeamRole | null,
  mySide: Side | null,
  side: Side | null,
): boolean {
  if (role === 'head_coach') return true
  if (role !== 'coach') return false
  return mySide == null || side == null || mySide === side
}

/** Roster title: "Offensive coordinator", "Head coach · DC", "Coach", "Player". */
export function staffTitle(role: TeamRole, side: Side | null): string {
  if (role === 'player') return 'Player'
  const coord =
    side === 'offense'
      ? 'Offensive coordinator'
      : side === 'defense'
        ? 'Defensive coordinator'
        : null
  if (role === 'head_coach') {
    if (side == null) return 'Head coach'
    return `Head coach · ${side === 'offense' ? 'OC' : 'DC'}`
  }
  return coord ?? 'Coach'
}
