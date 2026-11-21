import type { StaffSide, TeamRole } from '../data/database.types'

export const SIDE_LABEL: Record<StaffSide, string> = {
  offense: 'Offense',
  defense: 'Defense',
  special: 'Special teams',
}

/**
 * Mirrors app.can_edit_side in the database. Head coach edits everything, a coordinator
 * edits their own side, a coach with no side edits everything, players edit nothing. A
 * null `side` is shared. Special teams stay shared until the team names a special teams
 * coordinator (`specialCoordinator`).
 */
export function canEditSide(
  role: TeamRole | null,
  mySide: StaffSide | null,
  side: StaffSide | null,
  specialCoordinator = true,
): boolean {
  if (role === 'head_coach') return true
  if (role !== 'coach') return false
  if (mySide == null || side == null || mySide === side) return true
  return side === 'special' && !specialCoordinator
}

const SHORT: Record<StaffSide, string> = { offense: 'OC', defense: 'DC', special: 'STC' }
const LONG: Record<StaffSide, string> = {
  offense: 'Offensive coordinator',
  defense: 'Defensive coordinator',
  special: 'Special teams coordinator',
}

/** Roster title: "Offensive coordinator", "Head coach · STC", "Coach", "Player". */
export function staffTitle(role: TeamRole, side: StaffSide | null): string {
  if (role === 'player') return 'Player'
  if (role === 'head_coach') return side == null ? 'Head coach' : `Head coach · ${SHORT[side]}`
  return side == null ? 'Coach' : LONG[side]
}
