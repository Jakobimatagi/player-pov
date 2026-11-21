import type { DepthMap, RosterPlayer } from '../team/roster'
import type { PositionCode } from './database.types'
import { supabase } from './supabase'

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

const COLUMNS =
  'id, user_id, name, jersey, position, alt_positions, grad_year, height_in, weight_lb, notes'

interface Row {
  id: string
  user_id: string | null
  name: string
  jersey: number | null
  position: PositionCode | null
  alt_positions: PositionCode[]
  grad_year: number | null
  height_in: number | null
  weight_lb: number | null
  notes: string | null
}

function asPlayer(row: Row): RosterPlayer {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    jersey: row.jersey,
    position: row.position,
    altPositions: row.alt_positions ?? [],
    gradYear: row.grad_year,
    heightIn: row.height_in,
    weightLb: row.weight_lb,
    notes: row.notes ?? '',
  }
}

export type RosterPatch = Partial<Omit<RosterPlayer, 'id' | 'userId'>>

function columns(patch: RosterPatch) {
  const out: Record<string, unknown> = {}
  if (patch.name !== undefined) out['name'] = patch.name.trim()
  if (patch.jersey !== undefined) out['jersey'] = patch.jersey
  if (patch.position !== undefined) out['position'] = patch.position
  if (patch.altPositions !== undefined) out['alt_positions'] = patch.altPositions
  if (patch.gradYear !== undefined) out['grad_year'] = patch.gradYear
  if (patch.heightIn !== undefined) out['height_in'] = patch.heightIn
  if (patch.weightLb !== undefined) out['weight_lb'] = patch.weightLb
  if (patch.notes !== undefined) out['notes'] = patch.notes.trim() === '' ? null : patch.notes
  return out
}

function friendly(error: { code?: string; message: string }): Error {
  if (error.code === '42501') return new Error(error.message.replace(/^.*?: /, '') || 'Not allowed')
  if (error.code === '23514') return new Error('That value is out of range')
  return new Error(error.message)
}

export async function listRoster(teamId: string): Promise<RosterPlayer[]> {
  const { data, error } = await client()
    .from('roster_players')
    .select(COLUMNS)
    .eq('team_id', teamId)
    .order('name')
  if (error) throw friendly(error)
  return (data ?? []).map((row) => asPlayer(row as Row))
}

export async function addRosterPlayers(
  teamId: string,
  players: (RosterPatch & { name: string })[],
): Promise<RosterPlayer[]> {
  if (players.length === 0) return []
  const { data, error } = await client()
    .from('roster_players')
    .insert(
      players.map((player) => ({ team_id: teamId, ...columns(player), name: player.name.trim() })),
    )
    .select(COLUMNS)
  if (error) throw friendly(error)
  return (data ?? []).map((row) => asPlayer(row as Row))
}

export async function updateRosterPlayer(id: string, patch: RosterPatch): Promise<void> {
  const { data, error } = await client()
    .from('roster_players')
    .update(columns(patch))
    .eq('id', id)
    .select('id')
  if (error) throw friendly(error)
  if (data == null || data.length === 0) throw new Error('Not allowed')
}

export async function deleteRosterPlayer(id: string): Promise<void> {
  const { error } = await client().from('roster_players').delete().eq('id', id)
  if (error) throw friendly(error)
}

export async function mergeRosterPlayers(keepId: string, dropId: string): Promise<void> {
  const { error } = await client().rpc('merge_roster_players', { p_keep: keepId, p_drop: dropId })
  if (error) throw friendly(error)
}

export async function listDepth(teamId: string): Promise<DepthMap> {
  const { data, error } = await client()
    .from('depth_chart')
    .select('slot, rank, roster_player_id')
    .eq('team_id', teamId)
    .order('rank')
  if (error) throw friendly(error)
  const out: DepthMap = {}
  for (const row of data ?? []) {
    ;(out[row.slot] ??= []).push(row.roster_player_id)
  }
  return out
}

export async function setDepth(teamId: string, slot: string, playerIds: string[]): Promise<void> {
  const { error } = await client().rpc('set_depth', {
    p_team: teamId,
    p_slot: slot,
    p_players: playerIds,
  })
  if (error) throw friendly(error)
}
