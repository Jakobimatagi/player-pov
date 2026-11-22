import type { Pack, PackPlan, ScoutTask } from '../playbook/scoutPacks'
import type { PositionGroup, ScoutTaskStatus, StaffSide, TeamRole } from './database.types'
import { supabase } from './supabase'

/** A coach on the team, with the rooms they run. */
export interface StaffMember {
  userId: string
  name: string
  role: TeamRole
  side: StaffSide | null
  groups: PositionGroup[]
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

function denied(error: { code?: string; message: string }, fallback: string): Error {
  if (error.code === '42501') return new Error(fallback)
  return new Error(error.message)
}

const TASK_COLUMNS =
  'id, folder_id, parent_task_id, assignee_user, assignee_group, due_at, status, note, status_by, status_at, created_by'

function asTask(row: {
  id: string
  folder_id: string
  parent_task_id: string | null
  assignee_user: string | null
  assignee_group: PositionGroup | null
  due_at: string | null
  status: ScoutTaskStatus
  note: string | null
  status_by: string | null
  status_at: string | null
  created_by: string | null
}): ScoutTask {
  return {
    id: row.id,
    folderId: row.folder_id,
    parentTaskId: row.parent_task_id,
    userId: row.assignee_user,
    group: row.assignee_group,
    dueAt: row.due_at,
    status: row.status,
    note: row.note,
    statusBy: row.status_by,
    statusAt: row.status_at,
    createdBy: row.created_by,
  }
}

/** Every scout task on the team. Staff only; players read none. */
export async function listScoutTasks(teamId: string): Promise<ScoutTask[]> {
  const { data, error } = await client()
    .from('scout_tasks')
    .select(TASK_COLUMNS)
    .eq('team_id', teamId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map(asTask)
}

export async function createScoutTask(input: {
  teamId: string
  folderId: string
  parentTaskId: string | null
  userId: string | null
  group: PositionGroup | null
  dueAt: string | null
  note: string | null
  createdBy: string
}): Promise<ScoutTask> {
  const { data, error } = await client()
    .from('scout_tasks')
    .insert({
      team_id: input.teamId,
      folder_id: input.folderId,
      parent_task_id: input.parentTaskId,
      assignee_user: input.userId,
      assignee_group: input.group,
      due_at: input.dueAt,
      note: input.note,
      created_by: input.createdBy,
    })
    .select(TASK_COLUMNS)
    .single()
  if (error) throw denied(error, 'You can only delegate a section you can edit.')
  return asTask(data)
}

/** The assignee (or whoever delegated it) moves the task along. */
export async function setScoutTaskStatus(id: string, status: ScoutTaskStatus): Promise<ScoutTask> {
  const { data, error } = await client()
    .from('scout_tasks')
    .update({ status })
    .eq('id', id)
    .select(TASK_COLUMNS)
    .maybeSingle()
  if (error) throw denied(error, 'Only the assignee can change this status.')
  if (data == null) throw new Error('Only the assignee can change this status.')
  return asTask(data)
}

export async function deleteScoutTask(id: string): Promise<void> {
  const { data, error } = await client().from('scout_tasks').delete().eq('id', id).select('id')
  if (error) throw denied(error, 'Only the coach who delegated this can remove it.')
  if ((data ?? []).length === 0) {
    throw new Error('Only the coach who delegated this can remove it.')
  }
}

/** Every scout pack folder on the team, with its week. */
export async function listPacks(teamId: string): Promise<Pack[]> {
  const { data, error } = await client()
    .from('playbooks')
    .select('id, pack_week')
    .eq('team_id', teamId)
    .not('pack_week', 'is', null)
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap((row) =>
    row.pack_week == null ? [] : [{ id: row.id, week: row.pack_week }],
  )
}

/** Makes the pack folder and its sections in one call. Returns the pack folder id. */
export async function createScoutPack(teamId: string, plan: PackPlan): Promise<string> {
  const { data, error } = await client().rpc('create_scout_pack', {
    p_team: teamId,
    p_opponent: plan.opponent,
    p_week: plan.week,
    p_week_name: plan.weekName,
    p_side: plan.side,
    p_sections: plan.sections,
  })
  if (error) {
    if (error.code === '23505') {
      throw new Error(`There is already a scout pack for ${plan.opponent} that week`)
    }
    throw denied(error, 'Only the head coach or that side’s coordinator can make this pack.')
  }
  return data
}

/** Coaches on the team (head coach included), with their names and rooms. */
export async function listStaff(teamId: string): Promise<StaffMember[]> {
  const db = client()
  const [{ data: members, error }, { data: profiles }] = await Promise.all([
    db
      .from('memberships')
      .select('user_id, role, coordinates, coach_groups')
      .eq('team_id', teamId)
      .neq('role', 'player'),
    db.from('profiles').select('user_id, display_name'),
  ])
  if (error) throw new Error(error.message)
  const names = new Map((profiles ?? []).map((row) => [row.user_id, row.display_name]))
  return (members ?? [])
    .map((row) => ({
      userId: row.user_id,
      name: names.get(row.user_id) ?? 'Coach',
      role: row.role,
      side: row.coordinates,
      groups: row.coach_groups ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The rooms the signed-in coach runs. */
export async function loadMyGroups(teamId: string, userId: string): Promise<PositionGroup[]> {
  const { data, error } = await client()
    .from('memberships')
    .select('coach_groups')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.coach_groups ?? []
}

/** Head coach only: the rooms a coach runs. */
export async function setCoachGroups(
  teamId: string,
  userId: string,
  groups: readonly PositionGroup[],
): Promise<void> {
  const { data, error } = await client()
    .from('memberships')
    .update({ coach_groups: [...groups] })
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error('Only the head coach can change coach rooms.')
}

/** Folder names by id, for task lists outside the playbook page. */
export async function folderNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await client()
    .from('playbooks')
    .select('id, name')
    .in('id', [...ids])
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((row) => [row.id, row.name]))
}
