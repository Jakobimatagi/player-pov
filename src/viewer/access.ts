import type { TeamRole } from '../data/database.types'

/**
 * What the signed-in viewer may do on a saved play.
 * - free: every camera and every player (staff, or no backend).
 * - locked: a player with a coach-assigned slot. POV, Broadcast and Top-down all follow
 *   that one player, and Watch as, hop and tap-to-attach are off.
 * - unassigned: a player with no slot on this play. They watch freely, with a note.
 */
export type ViewerAccess =
  | { kind: 'loading' }
  | { kind: 'free'; staff: boolean }
  | { kind: 'locked'; slot: string; index: number }
  | { kind: 'unassigned'; slot: string | null }

export function viewerAccess(input: {
  backend: boolean
  savedPlay: boolean
  role: TeamRole | null
  slotLoaded: boolean
  slot: string | null
  ids: readonly string[]
}): ViewerAccess {
  if (!input.backend) return { kind: 'free', staff: false }
  if (input.role !== 'player') return { kind: 'free', staff: input.role != null }
  if (!input.savedPlay) return { kind: 'unassigned', slot: null }
  if (!input.slotLoaded) return { kind: 'loading' }
  if (input.slot == null) return { kind: 'unassigned', slot: null }
  const index = input.ids.indexOf(input.slot)
  if (index < 0) return { kind: 'unassigned', slot: input.slot }
  return { kind: 'locked', slot: input.slot, index }
}
