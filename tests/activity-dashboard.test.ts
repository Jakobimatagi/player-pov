import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  assignmentState,
  buildRows,
  emptyTotals,
  filterRows,
  followUps,
  formatDuration,
  isOverdue,
  lastActiveLabel,
  sortRows,
  streak,
  summarize,
  weekOf,
} from '../src/activity/stats'
import type { ActivityTotals, AssignmentProgress } from '../src/data/activity'
import { CoachHome } from '../src/app/CoachHome'
import { PlayerHome } from '../src/app/PlayerHome'
import { ActivityPage } from '../src/team/ActivityPage'

const NOW = new Date(2026, 10, 19, 15, 0) // Thu Nov 19 2026

const players = [
  { userId: 'u1', name: 'Marcus Hill', position: 'QB' },
  { userId: 'u2', name: 'Jordan Bell', position: 'S' },
  { userId: 'u3', name: 'Kai Brooks', position: 'WR' },
]

const totals = (userId: string, over: Partial<ActivityTotals>): ActivityTotals => ({
  ...emptyTotals(userId),
  ...over,
})

const progress = (over: Partial<AssignmentProgress>): AssignmentProgress => ({
  assignmentId: 'a1',
  playbookId: 'b1',
  playbookName: 'Base O',
  dueAt: null,
  userId: 'u1',
  playsTotal: 4,
  playsOpened: 0,
  playsRepped: 0,
  ...over,
})

describe('activity stats', () => {
  it('weeks run Monday to Sunday in local time', () => {
    const week = weekOf(NOW)
    expect(week.from).toBe('2026-11-16')
    expect(week.to).toBe('2026-11-22')
    expect(week.days).toHaveLength(7)
    expect(weekOf(NOW, -1).from).toBe('2026-11-09')
  })

  it('formats durations', () => {
    expect(formatDuration(42)).toBe('42s')
    expect(formatDuration(600)).toBe('10m')
    expect(formatDuration(3_900)).toBe('1h 05m')
  })

  it('an assignment is done only when every play was repped in POV', () => {
    expect(assignmentState(progress({}))).toBe('not_started')
    expect(assignmentState(progress({ playsOpened: 4, playsRepped: 3 }))).toBe('in_progress')
    expect(assignmentState(progress({ playsOpened: 4, playsRepped: 4 }))).toBe('done')
    expect(assignmentState(progress({ playsTotal: 0 }))).toBe('not_started')
  })

  it('overdue means past due and not done', () => {
    const due = new Date(2026, 10, 18).toISOString()
    expect(isOverdue(progress({ dueAt: due }), NOW)).toBe(true)
    expect(isOverdue(progress({ dueAt: due, playsOpened: 4, playsRepped: 4 }), NOW)).toBe(false)
    expect(isOverdue(progress({ dueAt: null }), NOW)).toBe(false)
  })

  it('builds a row for every player, zeros for the inactive, and filters by group', () => {
    const rows = buildRows(
      players,
      [totals('u1', { povReps: 5, povSeconds: 300, daysActive: 2 })],
      [progress({ userId: 'u1', playsOpened: 1 }), progress({ userId: 'u3' })],
      NOW,
    )
    expect(rows.map((row) => row.totals.povReps)).toEqual([5, 0, 0])
    expect(rows[2]).toMatchObject({ assigned: 1, notStarted: 1 })
    const all = { group: 'all', side: 'all', assignmentId: 'all' } as const
    expect(filterRows(rows, { ...all, group: 'DB' }, []).map((row) => row.userId)).toEqual(['u2'])
    expect(filterRows(rows, { ...all, side: 'offense' }, []).map((row) => row.userId)).toEqual([
      'u1',
      'u3',
    ])
    expect(
      filterRows(rows, { ...all, assignmentId: 'a1' }, [progress({ userId: 'u3' })]).map(
        (row) => row.userId,
      ),
    ).toEqual(['u3'])
    expect(summarize(rows)).toMatchObject({ players: 3, active: 1, povReps: 5 })
  })

  it('sorts least active first by reps, then time', () => {
    const rows = buildRows(
      players,
      [totals('u1', { povReps: 5 }), totals('u2', { povReps: 0, playbookSeconds: 90 })],
      [],
      NOW,
    )
    expect(sortRows(rows, 'least').map((row) => row.userId)).toEqual(['u3', 'u2', 'u1'])
    expect(sortRows(rows, 'most').map((row) => row.userId)).toEqual(['u1', 'u2', 'u3'])
  })

  it('lists who has not started and who is overdue per assignment', () => {
    const due = new Date(2026, 10, 18).toISOString()
    const list = followUps(
      [
        progress({ userId: 'u1', dueAt: due }),
        progress({ userId: 'u3', dueAt: due, playsOpened: 2, playsRepped: 1 }),
        progress({ userId: 'u2', dueAt: due, playsOpened: 4, playsRepped: 4 }),
      ],
      players,
      NOW,
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      total: 3,
      done: 1,
      notStarted: ['Marcus Hill'],
      overdue: ['Kai Brooks', 'Marcus Hill'],
    })
  })

  it('counts a streak ending today or yesterday', () => {
    expect(streak(['2026-11-19', '2026-11-18', '2026-11-17', '2026-11-15'], NOW)).toBe(3)
    expect(streak(['2026-11-18', '2026-11-17'], NOW)).toBe(2)
    expect(streak(['2026-11-16'], NOW)).toBe(0)
  })

  it('labels last active', () => {
    expect(lastActiveLabel(null, NOW)).toBe('Never')
    expect(lastActiveLabel('2026-11-19', NOW)).toBe('Today')
    expect(lastActiveLabel('2026-11-18', NOW)).toBe('Yesterday')
    expect(lastActiveLabel('2026-11-15', NOW)).toBe('4 days ago')
  })
})

describe('activity pages', () => {
  it('the dashboard shows the demo dataset with no backend, as a table and as phone cards', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/team/activity'] },
        createElement(ActivityPage, { now: NOW }),
      ),
    )
    expect(html).toContain('Demo data')
    expect(html).toContain('data-testid="activity-summary"')
    expect(html).toContain('data-testid="activity-table"')
    expect(html).toContain('data-testid="activity-cards"')
    expect(html).toContain('Not started')
    expect(html).toContain('Marcus Hill')
    expect(html).toContain('href="/team/activity"')
  })

  it('coach home links to the activity dashboard', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(CoachHome, { name: 'coach@example.com' })),
    )
    expect(html).toContain('href="/team/activity"')
    expect(html).toContain('Who studied this week')
  })

  it('player home shows the player their own numbers and what coaches see', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(PlayerHome, {
          name: 'qb@example.com',
          teamId: 't1',
          userId: 'u1',
          initial: [],
          initialActivity: {
            totals: totals('u1', { povReps: 7, povSeconds: 600, playbookSeconds: 300 }),
            progress: [progress({ userId: 'u1' })],
            activeDays: [],
          },
        }),
      ),
    )
    expect(html).toContain('Your study this week')
    expect(html).toContain('>7<')
    expect(html).toContain('15m')
    expect(html).toContain('Your coaches see these numbers')
  })
})
