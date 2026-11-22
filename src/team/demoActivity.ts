import type { ActivityDay, ActivityTotals, AssignmentProgress } from '../data/activity'
import { weekOf, type RosterEntry, type Week } from '../activity/stats'
import { DEMO_ROSTER } from './demoRoster'

/**
 * No-backend demo data for /team/activity. Nothing is captured in demo mode; this only
 * shows a coach what the dashboard looks like. Deterministic per player and week.
 */
export const DEMO_ACTIVITY_PLAYERS: RosterEntry[] = DEMO_ROSTER.map((player) => ({
  userId: player.id,
  name: player.name,
  position: player.position,
}))

const DEMO_PLAYS = [
  { id: 'demo-play-1', name: 'Flood Right', side: 'offense', slots: ['qb', 'x', 'h'] },
  { id: 'demo-play-2', name: 'Inside Zone', side: 'offense', slots: ['qb', 'rb', 'lt'] },
  { id: 'demo-play-3', name: 'Cover 3 Buzz', side: 'defense', slots: ['fs', 'mike', 'lcb'] },
  { id: 'demo-play-4', name: 'Tampa 2', side: 'defense', slots: ['mike', 'ss', 'rde'] },
] as const

export const DEMO_PLAY_NAMES = new Map<string, string>(
  DEMO_PLAYS.map((play) => [play.id, play.name]),
)

/** Small deterministic hash so the same player and week always show the same numbers. */
function seeded(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const OFFENSE = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'OL'])

function isOffense(position: string | null): boolean {
  return position != null && OFFENSE.has(position)
}

/** Daily rows for one player in one week; some players do little or nothing. */
export function demoDays(userId: string, week: Week, weekIndex: number): ActivityDay[] {
  const index = DEMO_ACTIVITY_PLAYERS.findIndex((player) => player.userId === userId)
  if (index < 0) return []
  const player = DEMO_ACTIVITY_PLAYERS[index]!
  const effort = seeded(index, 7)
  const plays = DEMO_PLAYS.filter((play) =>
    isOffense(player.position) ? play.side === 'offense' : play.side === 'defense',
  )
  const out: ActivityDay[] = []
  week.days.forEach((day, dayIndex) => {
    if (seeded(index * 31 + dayIndex, weekIndex + 100) > effort) return
    plays.forEach((play, playIndex) => {
      const r = seeded(index * 97 + dayIndex * 13 + playIndex, weekIndex + 200)
      if (r < 0.35) return
      const own = play.slots[index % play.slots.length]!
      out.push({
        day,
        playId: play.id,
        kind: 'playbook',
        slot: '',
        seconds: Math.round(60 + r * 240),
        runsCompleted: 0,
      })
      out.push({
        day,
        playId: play.id,
        kind: 'pov',
        slot: own,
        seconds: Math.round(40 + r * 200),
        runsCompleted: Math.round(1 + r * 4),
      })
      if (r > 0.75) {
        out.push({
          day,
          playId: play.id,
          kind: 'broadcast',
          slot: '',
          seconds: Math.round(30 + r * 60),
          runsCompleted: 1,
        })
      }
    })
  })
  return out
}

export function demoTotals(week: Week, weekIndex: number): ActivityTotals[] {
  return DEMO_ACTIVITY_PLAYERS.flatMap((player) => {
    const days = demoDays(player.userId, week, weekIndex)
    if (days.length === 0) return []
    const sum = (kind: ActivityDay['kind']) =>
      days.filter((row) => row.kind === kind).reduce((total, row) => total + row.seconds, 0)
    const reps = days
      .filter((row) => row.kind === 'pov')
      .reduce((total, row) => total + row.runsCompleted, 0)
    return [
      {
        userId: player.userId,
        playbookSeconds: sum('playbook'),
        povSeconds: sum('pov'),
        broadcastSeconds: sum('broadcast'),
        topdownSeconds: sum('topdown'),
        povReps: reps,
        ownSlotReps: reps,
        runsStarted: reps + 1,
        playsOpened: new Set(days.map((row) => row.playId)).size,
        daysActive: new Set(days.map((row) => row.day)).size,
        lastDay: days[days.length - 1]!.day,
      },
    ]
  })
}

/** Two folders: offense due in two days, defense due yesterday. */
export function demoProgress(now: Date): AssignmentProgress[] {
  const inDays = (n: number) => {
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 23, 59, 59)
    return due.toISOString()
  }
  // Progress follows this week's demo activity, so the lists agree with the table.
  const week = weekOf(now, 0)
  return DEMO_ACTIVITY_PLAYERS.map((player) => {
    const offense = isOffense(player.position)
    const days = demoDays(player.userId, week, 0)
    const opened = new Set(days.map((row) => row.playId)).size
    const repped = new Set(
      days.filter((row) => row.kind === 'pov' && row.runsCompleted > 0).map((row) => row.playId),
    ).size
    return {
      assignmentId: offense ? 'demo-asg-offense' : 'demo-asg-defense',
      playbookId: offense ? 'demo-book-offense' : 'demo-book-defense',
      playbookName: offense ? 'Week 12 install: offense' : 'Week 12 install: defense',
      dueAt: offense ? inDays(2) : inDays(-1),
      userId: player.userId,
      playsTotal: 2,
      playsOpened: opened,
      playsRepped: repped,
    }
  })
}
