import type { PositionGroup } from './database.types'
import type { LookSource } from '../play/sourceTypes'
import type { RepSpot } from '../reps/target'
import { supabase } from './supabase'

/** A coach's scout rep: where `slot` should end up on a play against one look. */
export interface ScoutRep {
  id: string
  teamId: string
  playId: string
  lookId: string
  slot: string
  target: RepSpot
  tolerance: number
  note: string
  createdAt: string
}

/** A rep handed to a position group or one player, with an optional due date. */
export interface RepAssignment {
  id: string
  repId: string
  group: PositionGroup | null
  userId: string | null
  dueAt: string | null
}

/** One assigned player's standing on one rep, for the coach. */
export interface RepResult {
  assignmentId: string
  repId: string
  userId: string
  dueAt: string | null
  attempts: number
  firstDistance: number | null
  firstPassed: boolean | null
  bestDistance: number | null
  passed: boolean
  lastAt: string | null
}

/**
 * A rep on the player's list. `target`, `tolerance` and `note` stay null until they have
 * tried it once: the server leaves them out until then.
 */
export interface Homework {
  assignmentId: string
  repId: string
  playId: string
  playName: string
  playSide: 'offense' | 'defense'
  lookId: string
  lookName: string
  slot: string
  dueAt: string | null
  assignedAt: string
  attempts: number
  passed: boolean
  bestDistance: number | null
  last: { spot: RepSpot; distance: number; passed: boolean } | null
  target: RepSpot | null
  tolerance: number | null
  note: string | null
}

export interface AttemptResult {
  distance: number
  passed: boolean
  target: RepSpot
  tolerance: number
  attempts: number
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

function denied(error: { code?: string; message: string }, fallback: string): Error {
  if (error.code === '42501') return new Error(fallback)
  if (error.code === '23505') return new Error('Already assigned.')
  return new Error(error.message)
}

const REP_COLUMNS =
  'id, team_id, play_id, look_id, slot, target_x, target_y, tolerance_yd, note, created_at'

type RepRow = {
  id: string
  team_id: string
  play_id: string
  look_id: string
  slot: string
  target_x: number
  target_y: number
  tolerance_yd: number
  note: string | null
  created_at: string
}

function toRep(row: RepRow): ScoutRep {
  return {
    id: row.id,
    teamId: row.team_id,
    playId: row.play_id,
    lookId: row.look_id,
    slot: row.slot,
    target: { x: row.target_x, y: row.target_y },
    tolerance: row.tolerance_yd,
    note: row.note ?? '',
    createdAt: row.created_at,
  }
}

/** Reps on one play. Staff only; a player reads nothing here. */
export async function listReps(playId: string): Promise<ScoutRep[]> {
  const { data, error } = await client()
    .from('scout_reps')
    .select(REP_COLUMNS)
    .eq('play_id', playId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map(toRep)
}

export async function createRep(input: {
  teamId: string
  playId: string
  lookId: string
  slot: string
  target: RepSpot
  tolerance: number
  note: string
  createdBy: string
}): Promise<ScoutRep> {
  const { data, error } = await client()
    .from('scout_reps')
    .insert({
      team_id: input.teamId,
      play_id: input.playId,
      look_id: input.lookId,
      slot: input.slot,
      target_x: input.target.x,
      target_y: input.target.y,
      tolerance_yd: input.tolerance,
      note: input.note.trim() === '' ? null : input.note.trim(),
      created_by: input.createdBy,
    })
    .select(REP_COLUMNS)
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('This play already has a rep for that position against that look.')
    }
    throw denied(error, 'Only the head coach or this play’s coordinator can make reps for it.')
  }
  return toRep(data)
}

export async function updateRep(
  id: string,
  input: { target: RepSpot; tolerance: number; note: string },
): Promise<void> {
  const { data, error } = await client()
    .from('scout_reps')
    .update({
      target_x: input.target.x,
      target_y: input.target.y,
      tolerance_yd: input.tolerance,
      note: input.note.trim() === '' ? null : input.note.trim(),
    })
    .eq('id', id)
    .select('id')
  if (error) throw denied(error, 'Only the head coach or this play’s coordinator can edit it.')
  if ((data ?? []).length === 0) {
    throw new Error('Only the head coach or this play’s coordinator can edit it.')
  }
}

export async function deleteRep(id: string): Promise<void> {
  const { data, error } = await client().from('scout_reps').delete().eq('id', id).select('id')
  if (error) throw denied(error, 'Only the head coach or this play’s coordinator can delete it.')
  if ((data ?? []).length === 0) {
    throw new Error('Only the head coach or this play’s coordinator can delete it.')
  }
}

/** Rep assignments for the given reps. */
export async function listRepAssignments(repIds: readonly string[]): Promise<RepAssignment[]> {
  if (repIds.length === 0) return []
  const { data, error } = await client()
    .from('assignments')
    .select('id, rep_id, assignee_group, assignee_user, due_at')
    .in('rep_id', [...repIds])
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap((row) =>
    row.rep_id == null
      ? []
      : [
          {
            id: row.id,
            repId: row.rep_id,
            group: row.assignee_group,
            userId: row.assignee_user,
            dueAt: row.due_at,
          },
        ],
  )
}

export async function assignRep(input: {
  teamId: string
  repId: string
  createdBy: string
  group: PositionGroup | null
  userId: string | null
  dueAt: string | null
}): Promise<RepAssignment> {
  const { data, error } = await client()
    .from('assignments')
    .insert({
      team_id: input.teamId,
      rep_id: input.repId,
      assignee_group: input.group,
      assignee_user: input.userId,
      due_at: input.dueAt,
      created_by: input.createdBy,
    })
    .select('id, rep_id, assignee_group, assignee_user, due_at')
    .single()
  if (error) {
    if (error.code === '23514') throw new Error(assignBlocked(error.message))
    throw denied(error, 'Only the head coach or this play’s coordinator can assign it.')
  }
  return {
    id: data.id,
    repId: data.rep_id ?? input.repId,
    group: data.assignee_group,
    userId: data.assignee_user,
    dueAt: data.due_at,
  }
}

/** The guard's reason, in coach words. */
export function assignBlocked(message: string): string {
  if (message.includes('publish the play')) return 'Publish the play before assigning this rep.'
  if (message.includes('see this look')) {
    return 'Those players can’t see this look yet. Assign them a scout package with it first.'
  }
  return message
}

export async function unassignRep(id: string): Promise<void> {
  const { data, error } = await client().from('assignments').delete().eq('id', id).select('id')
  if (error) throw denied(error, 'Only the head coach or this play’s coordinator can remove this.')
  if ((data ?? []).length === 0) {
    throw new Error('Only the head coach or this play’s coordinator can remove this.')
  }
}

export async function loadRepResults(teamId: string): Promise<RepResult[]> {
  const { data, error } = await client().rpc('rep_results', { p_team: teamId })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    assignmentId: row.assignment_id,
    repId: row.rep_id,
    userId: row.user_id,
    dueAt: row.due_at,
    attempts: row.attempts,
    firstDistance: row.first_distance,
    firstPassed: row.first_passed,
    bestDistance: row.best_distance,
    passed: row.passed,
    lastAt: row.last_at,
  }))
}

/** The signed-in player's reps. */
export async function loadHomework(teamId: string): Promise<Homework[]> {
  const { data, error } = await client().rpc('my_rep_homework', { p_team: teamId })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    assignmentId: row.assignment_id,
    repId: row.rep_id,
    playId: row.play_id,
    playName: row.play_name,
    playSide: row.play_side === 'defense' ? 'defense' : 'offense',
    lookId: row.look_id,
    lookName: row.look_name,
    slot: row.slot,
    dueAt: row.due_at,
    assignedAt: row.assigned_at,
    attempts: row.attempts,
    passed: row.passed,
    bestDistance: row.best_distance,
    last:
      row.last_x == null || row.last_y == null || row.last_distance == null
        ? null
        : {
            spot: { x: row.last_x, y: row.last_y },
            distance: row.last_distance,
            passed: row.last_passed === true,
          },
    target:
      row.target_x == null || row.target_y == null ? null : { x: row.target_x, y: row.target_y },
    tolerance: row.tolerance_yd,
    note: row.note,
  }))
}

/**
 * One look's current source. RLS decides: staff read every look, a player only the play's
 * own look or a look in a package assigned to them.
 */
export async function loadLookSource(
  lookId: string,
): Promise<{ id: string; name: string; source: LookSource }> {
  const db = client()
  const { data: look, error } = await db
    .from('scout_looks')
    .select('id, name, current_version')
    .eq('id', lookId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (look?.current_version == null) throw new Error('This look isn’t available to you.')
  const { data: version, error: versionError } = await db
    .from('scout_look_versions')
    .select('source')
    .eq('look_id', look.id)
    .eq('version', look.current_version)
    .maybeSingle()
  if (versionError) throw new Error(versionError.message)
  if (version == null) throw new Error('This look isn’t available to you.')
  return { id: look.id, name: look.name, source: version.source as unknown as LookSource }
}

/** Send one try. The server scores it and returns the right spot. */
export async function submitAttempt(assignmentId: string, spot: RepSpot): Promise<AttemptResult> {
  const { data, error } = await client().rpc('submit_rep_attempt', {
    p_assignment: assignmentId,
    p_x: spot.x,
    p_y: spot.y,
  })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (row == null) throw new Error('No result came back. Try again.')
  return {
    distance: row.distance_yd,
    passed: row.passed,
    target: { x: row.target_x, y: row.target_y },
    tolerance: row.tolerance_yd,
    attempts: row.attempts,
  }
}
