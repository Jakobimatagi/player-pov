import type { ActivityTotals, AssignmentProgress } from '../data/activity'
import type { PositionCode, PositionGroup } from '../data/database.types'
import { SIDE_GROUPS } from '../data/assignments'
import { localDay } from './meter'

export interface Week {
  /** Monday, yyyy-mm-dd. */
  from: string
  /** Sunday, yyyy-mm-dd. */
  to: string
  /** The seven days, Monday first. */
  days: string[]
  label: string
}

/** The Monday-to-Sunday week `offset` weeks from the one holding `anchor` (local time). */
export function weekOf(anchor: Date, offset = 0): Week {
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7)
  const days: string[] = []
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    days.push(localDay(day))
  }
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { from: days[0]!, to: days[6]!, days, label: `${fmt(monday)} – ${fmt(sunday)}` }
}

/** "45s", "12m", "1h 05m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const minutes = Math.floor(s / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function emptyTotals(userId: string): ActivityTotals {
  return {
    userId,
    playbookSeconds: 0,
    povSeconds: 0,
    broadcastSeconds: 0,
    topdownSeconds: 0,
    povReps: 0,
    ownSlotReps: 0,
    runsStarted: 0,
    playsOpened: 0,
    daysActive: 0,
    lastDay: null,
  }
}

export function studySeconds(totals: ActivityTotals): number {
  return (
    totals.playbookSeconds + totals.povSeconds + totals.broadcastSeconds + totals.topdownSeconds
  )
}

/** Share of viewer time spent in POV, 0..1, or null with no viewer time. */
export function povShare(totals: ActivityTotals): number | null {
  const viewer = totals.povSeconds + totals.broadcastSeconds + totals.topdownSeconds
  return viewer === 0 ? null : totals.povSeconds / viewer
}

export type AssignmentState = 'not_started' | 'in_progress' | 'done'

/** Done means every published play in the folder was watched in POV to the end. */
export function assignmentState(progress: AssignmentProgress): AssignmentState {
  if (progress.playsTotal > 0 && progress.playsRepped >= progress.playsTotal) return 'done'
  if (progress.playsOpened === 0) return 'not_started'
  return 'in_progress'
}

export function isOverdue(progress: AssignmentProgress, now: Date): boolean {
  return (
    progress.dueAt != null &&
    new Date(progress.dueAt).getTime() < now.getTime() &&
    assignmentState(progress) !== 'done'
  )
}

export interface RosterEntry {
  userId: string
  name: string
  position: PositionCode | string | null
}

export interface PlayerRow {
  userId: string
  name: string
  position: string | null
  group: PositionGroup | null
  totals: ActivityTotals
  assigned: number
  done: number
  notStarted: number
  overdue: number
}

const GROUP_OF: Record<string, PositionGroup> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OL: 'OL',
  DL: 'DL',
  LB: 'LB',
  CB: 'DB',
  S: 'DB',
  K: 'ST',
}

/** Same mapping as public.position_group_of. */
export function groupOfPosition(position: string | null): PositionGroup | null {
  return position == null ? null : (GROUP_OF[position] ?? null)
}

export function sideOfGroup(group: PositionGroup | null): 'offense' | 'defense' | 'special' | null {
  if (group == null) return null
  if (SIDE_GROUPS.offense.includes(group)) return 'offense'
  if (SIDE_GROUPS.defense.includes(group)) return 'defense'
  return 'special'
}

/** One row per rostered player, zeros for anyone with no activity this week. */
export function buildRows(
  players: readonly RosterEntry[],
  totals: readonly ActivityTotals[],
  progress: readonly AssignmentProgress[],
  now: Date,
): PlayerRow[] {
  const byUser = new Map(totals.map((row) => [row.userId, row]))
  return players.map((player) => {
    const mine = progress.filter((item) => item.userId === player.userId)
    return {
      userId: player.userId,
      name: player.name,
      position: player.position,
      group: groupOfPosition(player.position),
      totals: byUser.get(player.userId) ?? emptyTotals(player.userId),
      assigned: mine.length,
      done: mine.filter((item) => assignmentState(item) === 'done').length,
      notStarted: mine.filter((item) => assignmentState(item) === 'not_started').length,
      overdue: mine.filter((item) => isOverdue(item, now)).length,
    }
  })
}

export type SortKey = 'least' | 'most' | 'name'

export interface RowFilter {
  group: PositionGroup | 'all'
  side: 'offense' | 'defense' | 'special' | 'all'
  /** Only players assigned this, or every player. */
  assignmentId: string | 'all'
}

export function filterRows(
  rows: readonly PlayerRow[],
  filter: RowFilter,
  progress: readonly AssignmentProgress[],
): PlayerRow[] {
  const assigned =
    filter.assignmentId === 'all'
      ? null
      : new Set(
          progress
            .filter((item) => item.assignmentId === filter.assignmentId)
            .map((item) => item.userId),
        )
  return rows.filter(
    (row) =>
      (filter.group === 'all' || row.group === filter.group) &&
      (filter.side === 'all' || sideOfGroup(row.group) === filter.side) &&
      (assigned == null || assigned.has(row.userId)),
  )
}

/** Least active first: fewest POV reps, then least study time, then name. */
export function sortRows(rows: readonly PlayerRow[], key: SortKey): PlayerRow[] {
  const byName = (a: PlayerRow, b: PlayerRow) => a.name.localeCompare(b.name)
  const activity = (a: PlayerRow, b: PlayerRow) =>
    a.totals.povReps - b.totals.povReps || studySeconds(a.totals) - studySeconds(b.totals)
  return [...rows].sort((a, b) => {
    if (key === 'name') return byName(a, b)
    if (key === 'most') return activity(b, a) || byName(a, b)
    return activity(a, b) || byName(a, b)
  })
}

export interface TeamSummary {
  players: number
  active: number
  studySeconds: number
  povReps: number
  assignmentsDone: number
  assignmentsTotal: number
  overdue: number
}

export function summarize(rows: readonly PlayerRow[]): TeamSummary {
  return {
    players: rows.length,
    active: rows.filter((row) => row.totals.daysActive > 0).length,
    studySeconds: rows.reduce((sum, row) => sum + studySeconds(row.totals), 0),
    povReps: rows.reduce((sum, row) => sum + row.totals.povReps, 0),
    assignmentsDone: rows.reduce((sum, row) => sum + row.done, 0),
    assignmentsTotal: rows.reduce((sum, row) => sum + row.assigned, 0),
    overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
  }
}

export interface FollowUp {
  assignmentId: string
  name: string
  dueAt: string | null
  total: number
  done: number
  notStarted: string[]
  overdue: string[]
}

/** Per assignment: who has not opened it, and who is past due without finishing. */
export function followUps(
  progress: readonly AssignmentProgress[],
  players: readonly RosterEntry[],
  now: Date,
): FollowUp[] {
  const names = new Map(players.map((player) => [player.userId, player.name]))
  const out = new Map<string, FollowUp>()
  for (const item of progress) {
    const entry = out.get(item.assignmentId) ?? {
      assignmentId: item.assignmentId,
      name: item.playbookName,
      dueAt: item.dueAt,
      total: 0,
      done: 0,
      notStarted: [],
      overdue: [],
    }
    const name = names.get(item.userId) ?? 'A player'
    entry.total += 1
    if (assignmentState(item) === 'done') entry.done += 1
    if (assignmentState(item) === 'not_started') entry.notStarted.push(name)
    if (isOverdue(item, now)) entry.overdue.push(name)
    out.set(item.assignmentId, entry)
  }
  return [...out.values()]
    .map((entry) => ({
      ...entry,
      notStarted: entry.notStarted.sort(),
      overdue: entry.overdue.sort(),
    }))
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'))
}

/** Days in a row with activity, ending today (or yesterday, so the morning doesn't reset it). */
export function streak(activeDays: readonly string[], today: Date): number {
  const set = new Set(activeDays)
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!set.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  let count = 0
  while (set.has(localDay(cursor))) {
    count += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

/** "Today", "Yesterday", "3 days ago", or "Never". */
export function lastActiveLabel(lastDay: string | null, today: Date): string {
  if (lastDay == null) return 'Never'
  const [y, m, d] = lastDay.split('-').map(Number)
  const then = new Date(y!, m! - 1, d!)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((start.getTime() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/** Play player ids are lower case ("qb", "x"); show them like positions. */
export function slotLabel(slot: string): string {
  return slot.toUpperCase()
}
