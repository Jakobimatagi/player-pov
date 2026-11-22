import type { DepthNote, MyDepthNote, MyDepthSpot } from '../team/depthNotes'
import { supabase } from './supabase'

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

function friendly(error: { code?: string; message: string }): Error {
  if (error.code === '42501')
    return new Error('Only the author or the head coach can change this note')
  if (error.code === '23514') return new Error('Notes are 1 to 1000 characters')
  if (error.code === '23503') return new Error('That player is not on this roster')
  return new Error(error.message)
}

interface TeamRow {
  id: string
  roster_player_id: string
  slot: string | null
  body: string
  shared: boolean
  shared_at: string | null
  created_by: string | null
  author_name: string
  created_at: string
  updated_at: string
}

function asNote(row: TeamRow): DepthNote {
  return {
    id: row.id,
    rosterPlayerId: row.roster_player_id,
    slot: row.slot,
    body: row.body,
    shared: row.shared,
    sharedAt: row.shared_at,
    createdBy: row.created_by,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Every note on the team, for staff, oldest first. */
export async function listTeamDepthNotes(teamId: string): Promise<DepthNote[]> {
  const { data, error } = await client().rpc('team_depth_notes', { p_team: teamId })
  if (error) throw friendly(error)
  return (data ?? []).map(asNote)
}

export interface NoteDraft {
  body: string
  slot: string | null
  shared: boolean
}

const NOTE_COLUMNS =
  'id, roster_player_id, slot, body, shared, shared_at, created_by, created_at, updated_at'

export async function addDepthNote(
  teamId: string,
  rosterPlayerId: string,
  draft: NoteDraft,
  authorName: string,
): Promise<DepthNote> {
  const { data, error } = await client()
    .from('depth_notes')
    .insert({
      team_id: teamId,
      roster_player_id: rosterPlayerId,
      slot: draft.slot,
      body: draft.body,
      shared: draft.shared,
    })
    .select(NOTE_COLUMNS)
    .single()
  if (error) throw friendly(error)
  return asNote({ ...data, author_name: authorName })
}

export async function updateDepthNote(
  id: string,
  patch: Partial<NoteDraft>,
): Promise<Pick<DepthNote, 'body' | 'slot' | 'shared' | 'sharedAt' | 'updatedAt'>> {
  const { data, error } = await client()
    .from('depth_notes')
    .update(patch)
    .eq('id', id)
    .select('body, slot, shared, shared_at, updated_at')
  if (error) throw friendly(error)
  const row = data?.[0]
  if (row == null) throw new Error('Only the author or the head coach can change this note')
  return {
    body: row.body,
    slot: row.slot,
    shared: row.shared,
    sharedAt: row.shared_at,
    updatedAt: row.updated_at,
  }
}

export async function deleteDepthNote(id: string): Promise<void> {
  const { data, error } = await client().from('depth_notes').delete().eq('id', id).select('id')
  if (error) throw friendly(error)
  if (data == null || data.length === 0) {
    throw new Error('Only the author or the head coach can delete this note')
  }
}

export interface MyDepth {
  spots: MyDepthSpot[]
  notes: MyDepthNote[]
}

/** The signed-in player's own depth spots and the notes shared with them. */
export async function loadMyDepth(teamId: string): Promise<MyDepth> {
  const db = client()
  const [spots, notes] = await Promise.all([
    db.rpc('my_depth_spots', { p_team: teamId }),
    db.rpc('my_depth_notes', { p_team: teamId }),
  ])
  if (spots.error) throw friendly(spots.error)
  if (notes.error) throw friendly(notes.error)
  return {
    spots: (spots.data ?? []).map((row) => ({ slot: row.slot, rank: row.rank, depth: row.depth })),
    notes: (notes.data ?? []).map((row) => ({
      id: row.id,
      slot: row.slot,
      body: row.body,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sharedAt: row.shared_at,
    })),
  }
}
