import type { TeamRole } from '../data/database.types'

/**
 * What the signed-in viewer may do on a saved play.
 * - free: every camera and every player (staff, or no backend).
 * - locked: a player with a coach-assigned slot. The viewer opens in that player's helmet
 *   (see `startIndex`); Watch as still lists everyone, and "My position" comes back.
 * - unassigned: a player with no slot on this play. They watch freely, with a note.
 * - error: the slot or membership couldn't be loaded. Never fall back to free.
 */
export type ViewerAccess =
  | { kind: 'loading' }
  | { kind: 'free'; staff: boolean }
  | { kind: 'locked'; slot: string; index: number }
  | { kind: 'unassigned'; slot: string | null }
  | { kind: 'error' }

export function viewerAccess(input: {
  backend: boolean
  savedPlay: boolean
  role: TeamRole | null
  membershipError?: boolean
  slotError?: boolean
  slotLoaded: boolean
  slot: string | null
  ids: readonly string[]
}): ViewerAccess {
  if (!input.backend) return { kind: 'free', staff: false }
  if (input.membershipError) return { kind: 'error' }
  if (input.role !== 'player') return { kind: 'free', staff: input.role != null }
  // Demo and draft plays have no slots, so there is nothing to lock to.
  if (!input.savedPlay) return { kind: 'free', staff: false }
  if (input.slotError) return { kind: 'error' }
  if (!input.slotLoaded) return { kind: 'loading' }
  if (input.slot == null) return { kind: 'unassigned', slot: null }
  const index = input.ids.indexOf(input.slot)
  if (index < 0) return { kind: 'unassigned', slot: input.slot }
  return { kind: 'locked', slot: input.slot, index }
}

/**
 * The player index the viewer opens on: a player's own slot (from `player_slots`), or -1
 * to open as usual. It is a starting point, not a lock: Watch as, hops and tap-to-attach
 * still move the camera to anyone, and "My position" comes back.
 */
export function startIndex(access: ViewerAccess): number {
  return access.kind === 'locked' ? access.index : -1
}
