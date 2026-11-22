import type { PositionGroup, ScoutTaskStatus, StaffSide } from '../data/database.types'
import { breadcrumb, folderNameError, type Folder } from './folders'

/**
 * A scout pack is a folder tree: Opponents > <Team> > Week of <date> > sections.
 * The week folder is the pack. A new week for the same opponent makes a new week folder
 * next to the old one, so the first pack is never overwritten. The pack carries the side
 * of the unit that studies the opponent (defense unless picked otherwise).
 */
export const OPPONENTS_FOLDER = 'Opponents'
export const SCOUT_SECTIONS = ['Run Game', 'Pass Game', 'Special Teams', 'Tendencies'] as const
export const DEFAULT_PACK_SIDE: StaffSide = 'defense'

/** A pack folder and the Monday of its week (yyyy-mm-dd). */
export interface Pack {
  id: string
  week: string
}

/** One delegated section (or part of one). Mirrors public.scout_tasks. */
export interface ScoutTask {
  id: string
  folderId: string
  parentTaskId: string | null
  userId: string | null
  group: PositionGroup | null
  dueAt: string | null
  status: ScoutTaskStatus
  note: string | null
  statusBy: string | null
  statusAt: string | null
  createdBy: string | null
}

/** Who is looking: their user id and the coach rooms they run. */
export interface Me {
  userId: string | null
  groups: readonly PositionGroup[]
}

export const STATUS_LABEL: Record<ScoutTaskStatus, string> = {
  todo: 'Not started',
  in_progress: 'In progress',
  ready: 'Ready',
}
export const STATUS_ORDER: readonly ScoutTaskStatus[] = ['todo', 'in_progress', 'ready']

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDay(iso: string): Date | null {
  const match = ISO_DAY.exec(iso)
  if (match == null) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return isoDay(date) === iso ? date : null
}

/** The Monday on or before `day` (yyyy-mm-dd), or null when it isn't a date. */
export function weekOf(day: string): string | null {
  const date = parseDay(day)
  if (date == null) return null
  const back = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - back)
  return isoDay(date)
}

/** The Monday of the week `now` falls in. */
export function thisWeek(now: Date): string {
  return weekOf(isoDay(now))!
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Week of Nov 23" for the pack folder name. */
export function weekName(week: string): string {
  const date = parseDay(week)
  if (date == null) return `Week of ${week}`
  return `Week of ${MONTHS[date.getMonth()]} ${date.getDate()}`
}

export interface PackInput {
  opponent: string
  /** Any day in the week; the pack is filed under that week's Monday. */
  day: string
  side: StaffSide | null
  sections: readonly string[]
}

export interface PackPlan {
  opponent: string
  week: string
  weekName: string
  side: StaffSide | null
  sections: string[]
}

/** Checks the form and returns what to create, or the first problem. */
export function planPack(
  input: PackInput,
): { ok: true; plan: PackPlan } | { ok: false; error: string } {
  const opponent = input.opponent.trim()
  if (opponent.length === 0) return { ok: false, error: 'Enter the opponent' }
  if (opponent.length > 80) return { ok: false, error: 'Keep the opponent under 80 characters' }
  const week = weekOf(input.day)
  if (week == null) return { ok: false, error: 'Pick the week' }
  const sections: string[] = []
  for (const raw of input.sections) {
    const name = raw.trim()
    if (name.length === 0) continue
    const problem = folderNameError(name)
    if (problem != null) return { ok: false, error: problem }
    if (sections.some((other) => other.toLowerCase() === name.toLowerCase())) continue
    sections.push(name)
  }
  if (sections.length === 0) return { ok: false, error: 'Pick at least one section' }
  if (sections.length > 12) return { ok: false, error: 'A pack has at most 12 sections' }
  return {
    ok: true,
    plan: { opponent, week, weekName: weekName(week), side: input.side, sections },
  }
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * The folders a pack adds to the tree, reusing the Opponents folder and the opponent's
 * folder when they exist. Mirrors public.create_scout_pack, for the no-backend demo.
 */
export function packFolders(
  folders: readonly Folder[],
  packs: readonly Pack[],
  plan: PackPlan,
  makeId: () => string,
): { ok: true; pack: Folder; added: Folder[] } | { ok: false; error: string } {
  const live = folders.filter((folder) => !folder.archived)
  const added: Folder[] = []
  let root = live.find(
    (folder) => folder.parentId == null && sameName(folder.name, OPPONENTS_FOLDER),
  )
  if (root == null) {
    root = {
      id: makeId(),
      name: OPPONENTS_FOLDER,
      parentId: null,
      kind: 'opponent',
      archived: false,
    }
    added.push(root)
  }
  const rootId = root.id
  let team = live.find(
    (folder) => folder.parentId === rootId && sameName(folder.name, plan.opponent),
  )
  if (team == null) {
    team = {
      id: makeId(),
      name: plan.opponent,
      parentId: rootId,
      kind: 'opponent',
      archived: false,
    }
    added.push(team)
  }
  const teamId = team.id
  const clash = live.some(
    (folder) =>
      folder.parentId === teamId && packs.some((p) => p.id === folder.id && p.week === plan.week),
  )
  if (clash) return { ok: false, error: `There is already a scout pack for ${team.name} that week` }
  const pack: Folder = {
    id: makeId(),
    name: plan.weekName,
    parentId: teamId,
    kind: 'opponent',
    archived: false,
    side: plan.side,
  }
  added.push(pack)
  for (const name of plan.sections) {
    added.push({ id: makeId(), name, parentId: pack.id, kind: 'opponent', archived: false })
  }
  return { ok: true, pack, added }
}

/** The pack `folderId` sits in (itself included), or null. */
export function packOf(
  folders: readonly Folder[],
  packs: readonly Pack[],
  folderId: string | null,
): Pack | null {
  const ids = new Set(packs.map((pack) => pack.id))
  const path = breadcrumb(folders, folderId)
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (ids.has(path[i]!.id)) return packs.find((pack) => pack.id === path[i]!.id) ?? null
  }
  return null
}

/** True when the task goes to me, or to a room I run. */
export function isAssignee(task: ScoutTask, me: Me): boolean {
  if (task.userId != null) return me.userId != null && task.userId === me.userId
  return task.group != null && me.groups.includes(task.group)
}

/**
 * True when one of my tasks is on `folderId` or a folder above it. Mirrors
 * app.owns_section: that coach edits the folder whatever its side.
 */
export function ownsFolder(
  folders: readonly Folder[],
  tasks: readonly ScoutTask[],
  me: Me,
  folderId: string | null,
): boolean {
  if (folderId == null) return false
  const mine = new Set(tasks.filter((task) => isAssignee(task, me)).map((task) => task.folderId))
  if (mine.size === 0) return false
  return breadcrumb(folders, folderId).some((folder) => mine.has(folder.id))
}

/**
 * Who may reassign or delete a task: whoever delegated it, or a coach with side rights on
 * the section (`sideRights`). Mirrors app.manages_scout_task.
 */
export function canManageTask(task: ScoutTask, me: Me, sideRights: boolean): boolean {
  return sideRights || (me.userId != null && task.createdBy === me.userId)
}

/** The assignee, or whoever manages the task, may set its status. */
export function canSetStatus(task: ScoutTask, me: Me, sideRights: boolean): boolean {
  return isAssignee(task, me) || canManageTask(task, me, sideRights)
}

/** Side rights on the section, or owning it already (handing it on, one level at a time). */
export function canDelegate(sideRights: boolean, owns: boolean): boolean {
  return sideRights || owns
}

/** My task that covers `folderId`, nearest first. A hand-on records it as the parent. */
export function myCoveringTask(
  folders: readonly Folder[],
  tasks: readonly ScoutTask[],
  me: Me,
  folderId: string,
): ScoutTask | null {
  const path = breadcrumb(folders, folderId)
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const task = tasks.find((item) => item.folderId === path[i]!.id && isAssignee(item, me))
    if (task != null) return task
  }
  return null
}

export type SectionState = 'unassigned' | ScoutTaskStatus | 'published'

/**
 * A section's state on the pack board: the least-done task on it, 'unassigned' with no
 * task, and 'published' once it's ready and every play in it is published.
 */
export function sectionState(
  tasks: readonly ScoutTask[],
  plays: { total: number; published: number },
): SectionState {
  if (tasks.length === 0) return 'unassigned'
  const least = STATUS_ORDER.find((status) => tasks.some((task) => task.status === status))!
  if (least === 'ready' && plays.total > 0 && plays.published === plays.total) return 'published'
  return least
}

export const SECTION_LABEL: Record<SectionState, string> = {
  unassigned: 'Not delegated',
  ...STATUS_LABEL,
  published: 'Published',
}

export type DueState = 'overdue' | 'soon' | null

/** Overdue once past due and not ready; soon within two days. */
export function dueState(task: Pick<ScoutTask, 'dueAt' | 'status'>, now: number): DueState {
  if (task.dueAt == null || task.status === 'ready') return null
  const due = new Date(task.dueAt).getTime()
  if (!Number.isFinite(due)) return null
  if (due < now) return 'overdue'
  if (due - now < 2 * 24 * 60 * 60 * 1000) return 'soon'
  return null
}

/** My tasks that are not ready yet, soonest due first, undated last. */
export function myOpenTasks(tasks: readonly ScoutTask[], me: Me): ScoutTask[] {
  return tasks
    .filter((task) => task.status !== 'ready' && isAssignee(task, me))
    .sort((a, b) => {
      if (a.dueAt == null) return b.dueAt == null ? 0 : 1
      if (b.dueAt == null) return -1
      return a.dueAt.localeCompare(b.dueAt)
    })
}
