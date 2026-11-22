import type { PositionGroup } from './database.types'
import type { TeamPlayer } from './slots'
import { supabase } from './supabase'

/**
 * Who a playbook folder is assigned to: one player, or a whole position group. A player
 * sees an assigned folder, every folder under it, and the published plays inside.
 */
export interface Assignment {
  id: string
  playbookId: string
  group: PositionGroup | null
  userId: string | null
  dueAt: string | null
}

export const POSITION_GROUPS: readonly { id: PositionGroup; label: string }[] = [
  { id: 'QB', label: 'Quarterbacks' },
  { id: 'RB', label: 'Running backs' },
  { id: 'WR', label: 'Receivers' },
  { id: 'TE', label: 'Tight ends' },
  { id: 'OL', label: 'Offensive line' },
  { id: 'DL', label: 'Defensive line' },
  { id: 'LB', label: 'Linebackers' },
  { id: 'DB', label: 'Defensive backs' },
  { id: 'ST', label: 'Special teams' },
]

/** Groups that usually study each side's books, listed first in the picker. */
export const SIDE_GROUPS: Record<'offense' | 'defense' | 'special', readonly PositionGroup[]> = {
  offense: ['QB', 'RB', 'WR', 'TE', 'OL'],
  defense: ['DL', 'LB', 'DB'],
  special: ['ST'],
}

/** "Fri, Nov 27" in the viewer's locale; due dates are stored as the end of that day. */
export function dueLabel(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** A date input's yyyy-mm-dd as the last moment of that local day. */
export function dueFromDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 23, 59, 59).toISOString()
}

export function assigneeLabel(
  assignment: Pick<Assignment, 'group' | 'userId'>,
  players: readonly TeamPlayer[],
): string {
  if (assignment.group != null) {
    return POSITION_GROUPS.find((group) => group.id === assignment.group)?.label ?? assignment.group
  }
  return players.find((player) => player.userId === assignment.userId)?.name ?? 'A player'
}

/** "DB, LB, 2 players" for a folder row. */
export function assignedSummary(
  assignments: readonly Assignment[],
  players: readonly TeamPlayer[],
): string {
  const groups = assignments.flatMap((item) => (item.group == null ? [] : [item.group]))
  const people = assignments.filter((item) => item.userId != null)
  const parts: string[] = [...groups]
  if (people.length === 1) parts.push(assigneeLabel(people[0]!, players))
  else if (people.length > 1) parts.push(`${people.length} players`)
  return parts.join(', ')
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

function denied(error: { code?: string; message: string }): Error {
  if (error.code === '42501') {
    return new Error('Only the head coach or this book’s coordinator can assign it.')
  }
  return new Error(error.message)
}

/** Every playbook assignment on the team (staff see them all). */
export async function listAssignments(teamId: string): Promise<Assignment[]> {
  const { data, error } = await client()
    .from('assignments')
    .select('id, playbook_id, assignee_group, assignee_user, due_at')
    .eq('team_id', teamId)
    .not('playbook_id', 'is', null)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap((row) =>
    row.playbook_id == null
      ? []
      : [
          {
            id: row.id,
            playbookId: row.playbook_id,
            group: row.assignee_group,
            userId: row.assignee_user,
            dueAt: row.due_at,
          },
        ],
  )
}

export async function createAssignment(input: {
  teamId: string
  playbookId: string
  createdBy: string
  group: PositionGroup | null
  userId: string | null
  dueAt: string | null
}): Promise<Assignment> {
  const { data, error } = await client()
    .from('assignments')
    .insert({
      team_id: input.teamId,
      playbook_id: input.playbookId,
      assignee_group: input.group,
      assignee_user: input.userId,
      due_at: input.dueAt,
      created_by: input.createdBy,
    })
    .select('id, playbook_id, assignee_group, assignee_user, due_at')
    .single()
  if (error) throw denied(error)
  return {
    id: data.id,
    playbookId: data.playbook_id ?? input.playbookId,
    group: data.assignee_group,
    userId: data.assignee_user,
    dueAt: data.due_at,
  }
}

export async function deleteAssignment(id: string): Promise<void> {
  const { data, error } = await client().from('assignments').delete().eq('id', id).select('id')
  if (error) throw denied(error)
  if ((data ?? []).length === 0) {
    throw new Error('Only the head coach or this book’s coordinator can remove this.')
  }
}
