import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Folder } from '../src/playbook/folders'
import {
  canDelegate,
  canManageTask,
  canSetStatus,
  dueState,
  isAssignee,
  myCoveringTask,
  myOpenTasks,
  ownsFolder,
  packFolders,
  packOf,
  planPack,
  SCOUT_SECTIONS,
  sectionState,
  thisWeek,
  weekName,
  weekOf,
  type Me,
  type Pack,
  type ScoutTask,
} from '../src/playbook/scoutPacks'

function ids() {
  let n = 0
  return () => {
    n += 1
    return `f${n}`
  }
}

const task = (over: Partial<ScoutTask>): ScoutTask => ({
  id: 't',
  folderId: 'run',
  parentTaskId: null,
  userId: null,
  group: null,
  dueAt: null,
  status: 'todo',
  note: null,
  statusBy: null,
  statusAt: null,
  createdBy: 'hc',
  ...over,
})

const folder = (id: string, parentId: string | null, name = id): Folder => ({
  id,
  name,
  parentId,
  kind: 'opponent',
  archived: false,
})

describe('scout pack template', () => {
  it('files a pack under the Monday of its week and names it for that week', () => {
    expect(weekOf('2026-11-26')).toBe('2026-11-23')
    expect(weekOf('2026-11-23')).toBe('2026-11-23')
    expect(weekOf('2026-11-29')).toBe('2026-11-23')
    expect(weekOf('2026-02-30')).toBeNull()
    expect(weekName('2026-11-23')).toBe('Week of Nov 23')
    expect(thisWeek(new Date(2026, 10, 21))).toBe('2026-11-16')
  })

  it('plans the opponent, the week and the four sections', () => {
    const result = planPack({
      opponent: '  Lincoln High ',
      day: '2026-11-25',
      side: 'defense',
      sections: [...SCOUT_SECTIONS],
    })
    expect(result).toEqual({
      ok: true,
      plan: {
        opponent: 'Lincoln High',
        week: '2026-11-23',
        weekName: 'Week of Nov 23',
        side: 'defense',
        sections: ['Run Game', 'Pass Game', 'Special Teams', 'Tendencies'],
      },
    })
  })

  it('rejects a missing opponent, week or sections, and drops blank and repeat sections', () => {
    expect(planPack({ opponent: ' ', day: '2026-11-25', side: null, sections: ['A'] })).toEqual({
      ok: false,
      error: 'Enter the opponent',
    })
    expect(planPack({ opponent: 'X', day: '', side: null, sections: ['A'] })).toEqual({
      ok: false,
      error: 'Pick the week',
    })
    expect(planPack({ opponent: 'X', day: '2026-11-25', side: null, sections: [' '] })).toEqual({
      ok: false,
      error: 'Pick at least one section',
    })
    const result = planPack({
      opponent: 'X',
      day: '2026-11-25',
      side: null,
      sections: ['Run Game', '', 'run game', 'Tendencies'],
    })
    expect(result.ok && result.plan.sections).toEqual(['Run Game', 'Tendencies'])
  })

  it('makes Opponents > team > week > sections the first time', () => {
    const plan = planPack({
      opponent: 'Lincoln High',
      day: '2026-11-25',
      side: 'defense',
      sections: [...SCOUT_SECTIONS],
    })
    if (!plan.ok) throw new Error(plan.error)
    const result = packFolders([], [], plan.plan, ids())
    if (!result.ok) throw new Error(result.error)
    const names = result.added.map((item) => item.name)
    expect(names).toEqual([
      'Opponents',
      'Lincoln High',
      'Week of Nov 23',
      'Run Game',
      'Pass Game',
      'Special Teams',
      'Tendencies',
    ])
    expect(result.pack.side).toBe('defense')
    expect(result.added.filter((item) => item.parentId === result.pack.id)).toHaveLength(4)
  })

  it('reuses the opponent folder for a new week and never overwrites the first pack', () => {
    const existing: Folder[] = [
      folder('opp', null, 'Opponents'),
      folder('lincoln', 'opp', 'Lincoln High'),
      folder('wk1', 'lincoln', 'Week of Nov 23'),
    ]
    const packs: Pack[] = [{ id: 'wk1', week: '2026-11-23' }]
    const next = planPack({
      opponent: 'lincoln high',
      day: '2026-12-02',
      side: 'defense',
      sections: ['Run Game'],
    })
    if (!next.ok) throw new Error(next.error)
    const result = packFolders(existing, packs, next.plan, ids())
    if (!result.ok) throw new Error(result.error)
    expect(result.added.map((item) => item.name)).toEqual(['Week of Nov 30', 'Run Game'])
    expect(result.pack.parentId).toBe('lincoln')

    const again = planPack({
      opponent: 'Lincoln High',
      day: '2026-11-24',
      side: 'defense',
      sections: ['Run Game'],
    })
    if (!again.ok) throw new Error(again.error)
    expect(packFolders(existing, packs, again.plan, ids())).toEqual({
      ok: false,
      error: 'There is already a scout pack for Lincoln High that week',
    })
  })

  it('finds the pack a section sits in', () => {
    const tree = [folder('wk1', null), folder('run', 'wk1'), folder('iz', 'run'), folder('x', null)]
    const packs = [{ id: 'wk1', week: '2026-11-23' }]
    expect(packOf(tree, packs, 'iz')?.id).toBe('wk1')
    expect(packOf(tree, packs, 'wk1')?.id).toBe('wk1')
    expect(packOf(tree, packs, 'x')).toBeNull()
    expect(packOf(tree, packs, null)).toBeNull()
  })
})

describe('scout tasks', () => {
  const oc: Me = { userId: 'oc', groups: [] }
  const lbCoach: Me = { userId: 'lb', groups: ['LB', 'DL'] }
  const stranger: Me = { userId: 'st', groups: [] }
  const tree = [
    folder('wk1', null),
    folder('run', 'wk1'),
    folder('iz', 'run'),
    folder('pass', 'wk1'),
  ]

  it('goes to one coach or everyone in a room', () => {
    expect(isAssignee(task({ userId: 'oc' }), oc)).toBe(true)
    expect(isAssignee(task({ userId: 'oc' }), lbCoach)).toBe(false)
    expect(isAssignee(task({ group: 'LB' }), lbCoach)).toBe(true)
    expect(isAssignee(task({ group: 'DB' }), lbCoach)).toBe(false)
    expect(isAssignee(task({ userId: 'oc' }), { userId: null, groups: [] })).toBe(false)
  })

  it('lets the assignee edit the section and everything under it, nothing else', () => {
    const tasks = [task({ folderId: 'run', userId: 'oc' })]
    expect(ownsFolder(tree, tasks, oc, 'run')).toBe(true)
    expect(ownsFolder(tree, tasks, oc, 'iz')).toBe(true)
    expect(ownsFolder(tree, tasks, oc, 'pass')).toBe(false)
    expect(ownsFolder(tree, tasks, oc, 'wk1')).toBe(false)
    expect(ownsFolder(tree, tasks, stranger, 'run')).toBe(false)
  })

  it('lets the assignee set status but only the delegator or side rights reassign', () => {
    const mine = task({ userId: 'oc', createdBy: 'hc' })
    expect(canSetStatus(mine, oc, false)).toBe(true)
    expect(canManageTask(mine, oc, false)).toBe(false)
    expect(canManageTask(mine, { userId: 'hc', groups: [] }, false)).toBe(true)
    expect(canManageTask(mine, stranger, true)).toBe(true)
    expect(canSetStatus(mine, stranger, false)).toBe(false)
  })

  it('hands on one level at a time from the task that covers the folder', () => {
    const parent = task({ id: 'p', folderId: 'run', userId: 'oc' })
    expect(canDelegate(false, true)).toBe(true)
    expect(canDelegate(false, false)).toBe(false)
    expect(myCoveringTask(tree, [parent], oc, 'iz')?.id).toBe('p')
    expect(myCoveringTask(tree, [parent], oc, 'pass')).toBeNull()
  })

  it('shows the least-done state of a section, and published once its plays are', () => {
    expect(sectionState([], { total: 0, published: 0 })).toBe('unassigned')
    expect(
      sectionState([task({ status: 'ready' }), task({ status: 'in_progress' })], {
        total: 1,
        published: 1,
      }),
    ).toBe('in_progress')
    expect(sectionState([task({ status: 'ready' })], { total: 2, published: 1 })).toBe('ready')
    expect(sectionState([task({ status: 'ready' })], { total: 2, published: 2 })).toBe('published')
    expect(sectionState([task({ status: 'ready' })], { total: 0, published: 0 })).toBe('ready')
  })

  it('flags overdue and soon-due work that is not ready', () => {
    const now = new Date('2026-11-25T12:00:00Z').getTime()
    expect(dueState({ dueAt: '2026-11-24T23:59:59Z', status: 'todo' }, now)).toBe('overdue')
    expect(dueState({ dueAt: '2026-11-24T23:59:59Z', status: 'ready' }, now)).toBeNull()
    expect(dueState({ dueAt: '2026-11-26T23:59:59Z', status: 'in_progress' }, now)).toBe('soon')
    expect(dueState({ dueAt: '2026-12-10T23:59:59Z', status: 'todo' }, now)).toBeNull()
    expect(dueState({ dueAt: null, status: 'todo' }, now)).toBeNull()
  })

  it('lists my open tasks soonest first, room tasks included', () => {
    const tasks = [
      task({ id: 'late', userId: 'lb', dueAt: '2026-11-28T00:00:00Z' }),
      task({ id: 'room', group: 'DL', dueAt: '2026-11-26T00:00:00Z' }),
      task({ id: 'none', group: 'LB' }),
      task({ id: 'done', userId: 'lb', status: 'ready' }),
      task({ id: 'other', userId: 'oc' }),
    ]
    expect(myOpenTasks(tasks, lbCoach).map((item) => item.id)).toEqual(['room', 'late', 'none'])
  })
})

describe('scout packs migration', () => {
  const sql = readFileSync('supabase/migrations/20261202000000_scout_packs.sql', 'utf8')
  const down = readFileSync('supabase/down/20261202000000_scout_packs.sql', 'utf8')

  it('keeps tasks staff-only and leaves the player-only assignment rule alone', () => {
    expect(sql).toMatch(/create policy st_select on public\.scout_tasks[\s\S]*?app\.is_staff/)
    expect(sql).not.toMatch(/guard_assignment/)
  })

  it('has a rollback that removes what it adds', () => {
    for (const name of [
      'public.scout_tasks',
      'public.create_scout_pack',
      'app.owns_section',
      'coach_groups',
      'pack_week',
    ]) {
      expect(down).toContain(name)
    }
  })
})
