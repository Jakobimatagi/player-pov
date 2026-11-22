import type { ActivityEntry } from '../activity/meter'
import type { ActivityKind } from './database.types'
import { supabase } from './supabase'

/** One player's totals for a date range (activity_summary). */
export interface ActivityTotals {
  userId: string
  playbookSeconds: number
  povSeconds: number
  broadcastSeconds: number
  topdownSeconds: number
  /** Runs watched to the end in POV: mental reps. */
  povReps: number
  /** Of those, reps watched as the player's own slot. */
  ownSlotReps: number
  runsStarted: number
  playsOpened: number
  daysActive: number
  /** Last day with any activity, ever. yyyy-mm-dd. */
  lastDay: string | null
}

/** One player's progress on one playbook assignment (assignment_progress). */
export interface AssignmentProgress {
  assignmentId: string
  playbookId: string
  playbookName: string
  dueAt: string | null
  userId: string
  playsTotal: number
  playsOpened: number
  playsRepped: number
}

/** One daily rollup row, for a player's detail view. */
export interface ActivityDay {
  day: string
  playId: string
  kind: ActivityKind
  slot: string
  seconds: number
  runsCompleted: number
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

export async function recordActivity(input: {
  teamId: string
  playId: string
  day: string
  entry: ActivityEntry
}): Promise<void> {
  const { error } = await client().rpc('record_activity', {
    p_team: input.teamId,
    p_play: input.playId,
    p_day: input.day,
    p_kind: input.entry.kind,
    p_slot: input.entry.slot,
    p_seconds: input.entry.seconds,
    p_runs_started: input.entry.runsStarted,
    p_runs_completed: input.entry.runsCompleted,
  })
  if (error) throw new ActivitySendError(error.message, !error.code)
}

/** A failed heartbeat. `retry` is true for a network failure, false when the server refused. */
export class ActivitySendError extends Error {
  readonly retry: boolean
  constructor(message: string, retry: boolean) {
    super(message)
    this.retry = retry
  }
}

/** Coaches get every active player; a player gets only their own row. */
export async function loadActivityTotals(
  teamId: string,
  from: string,
  to: string,
): Promise<ActivityTotals[]> {
  const { data, error } = await client().rpc('activity_summary', {
    p_team: teamId,
    p_from: from,
    p_to: to,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    playbookSeconds: row.playbook_seconds,
    povSeconds: row.pov_seconds,
    broadcastSeconds: row.broadcast_seconds,
    topdownSeconds: row.topdown_seconds,
    povReps: row.pov_reps,
    ownSlotReps: row.own_slot_reps,
    runsStarted: row.runs_started,
    playsOpened: row.plays_opened,
    daysActive: row.days_active,
    lastDay: row.last_day,
  }))
}

export async function loadAssignmentProgress(teamId: string): Promise<AssignmentProgress[]> {
  const { data, error } = await client().rpc('assignment_progress', { p_team: teamId })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    assignmentId: row.assignment_id,
    playbookId: row.playbook_id,
    playbookName: row.playbook_name,
    dueAt: row.due_at,
    userId: row.user_id,
    playsTotal: row.plays_total,
    playsOpened: row.plays_opened,
    playsRepped: row.plays_repped,
  }))
}

/** One player's daily rows in a range. RLS limits a player to their own. */
export async function loadActivityDays(
  teamId: string,
  userId: string,
  from: string,
  to: string,
): Promise<ActivityDay[]> {
  const { data, error } = await client()
    .from('activity_daily')
    .select('day, play_id, kind, slot, seconds, runs_completed')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .gte('day', from)
    .lte('day', to)
    .order('day')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    day: row.day,
    playId: row.play_id,
    kind: row.kind,
    slot: row.slot,
    seconds: row.seconds,
    runsCompleted: row.runs_completed,
  }))
}

/** Play names for a detail view. RLS returns only plays the caller can see. */
export async function loadPlayNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await client()
    .from('plays')
    .select('id, name')
    .in('id', [...ids])
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((row) => [row.id, row.name]))
}
