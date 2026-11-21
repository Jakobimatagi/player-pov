import type { CompiledPlay } from '../play/types'
import { supabase } from './supabase'

/** One coach-assigned seat: this player watches this play as `slot` (a play player id). */
export interface SlotRow {
  userId: string
  slot: string
}

export interface TeamPlayer {
  userId: string
  name: string
  position: string | null
}

export interface AssignedPlay {
  id: string
  name: string
  side: 'offense' | 'defense'
  slot: string | null
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

/** Roster index for a slot id, or -1 when the play has no such player. */
export function slotIndex(play: Pick<CompiledPlay, 'ids'>, slot: string | null): number {
  if (slot == null || slot === '') return -1
  return play.ids.indexOf(slot)
}

/** Slots grouped by slot id, so the coach panel can list who watches each player. */
export function groupSlots(rows: SlotRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const row of rows) {
    const list = out.get(row.slot) ?? []
    list.push(row.userId)
    out.set(row.slot, list)
  }
  return out
}

/** The caller's own slot on a play. RLS returns nothing for a play they cannot view. */
export async function loadMySlot(playId: string, userId: string): Promise<string | null> {
  const { data, error } = await client()
    .from('player_slots')
    .select('slot')
    .eq('play_id', playId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.slot ?? null
}

export async function listSlots(playId: string): Promise<SlotRow[]> {
  const { data, error } = await client()
    .from('player_slots')
    .select('user_id, slot')
    .eq('play_id', playId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ userId: row.user_id, slot: row.slot }))
}

/**
 * Put a player in a slot, or clear them with `slot: null`. A player holds one slot per
 * play, so this replaces any earlier slot. Delete then insert: the table grants UPDATE on
 * `slot` only, which an upsert would exceed.
 */
export async function setSlot(input: {
  teamId: string
  playId: string
  userId: string
  slot: string | null
}): Promise<void> {
  const db = client()
  const { error: deleteError } = await db
    .from('player_slots')
    .delete()
    .eq('play_id', input.playId)
    .eq('user_id', input.userId)
  if (deleteError) throw new Error(deleteError.message)
  if (input.slot == null) return
  const { error } = await db.from('player_slots').insert({
    team_id: input.teamId,
    play_id: input.playId,
    user_id: input.userId,
    slot: input.slot,
  })
  if (error) throw new Error(error.message)
}

/** Players on the team, for the coach's slot picker. */
export async function listTeamPlayers(teamId: string): Promise<TeamPlayer[]> {
  const { data, error } = await client()
    .from('roster_public')
    .select('user_id, display_name, position, role')
    .eq('team_id', teamId)
    .eq('role', 'player')
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    position: row.position,
  }))
}

/**
 * Plays a player may open, with their slot on each. RLS on `plays` already limits a
 * player to plays in a playbook assigned to them.
 */
export async function listAssignedPlays(teamId: string, userId: string): Promise<AssignedPlay[]> {
  const db = client()
  const [{ data: plays, error }, { data: slots, error: slotError }] = await Promise.all([
    db
      .from('plays')
      .select('id, name, side')
      .eq('team_id', teamId)
      .is('archived_at', null)
      .not('current_version', 'is', null)
      .order('name'),
    db.from('player_slots').select('play_id, slot').eq('user_id', userId),
  ])
  if (error) throw new Error(error.message)
  if (slotError) throw new Error(slotError.message)
  const mine = new Map((slots ?? []).map((row) => [row.play_id, row.slot]))
  return (plays ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    side: row.side === 'defense' ? 'defense' : 'offense',
    slot: mine.get(row.id) ?? null,
  }))
}
