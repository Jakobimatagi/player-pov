import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import {
  loadActivityDays,
  loadActivityTotals,
  loadAssignmentProgress,
  loadPlayNames,
  type ActivityDay,
  type ActivityTotals,
  type AssignmentProgress,
} from '../data/activity'
import { dueLabel, POSITION_GROUPS } from '../data/assignments'
import type { PositionGroup } from '../data/database.types'
import { listTeamPlayers } from '../data/slots'
import { supabase } from '../data/supabase'
import {
  assignmentState,
  buildRows,
  filterRows,
  followUps,
  formatDuration,
  isOverdue,
  lastActiveLabel,
  povShare,
  slotLabel,
  sortRows,
  studySeconds,
  summarize,
  weekOf,
  type PlayerRow,
  type RosterEntry,
  type RowFilter,
  type SortKey,
  type Week,
} from '../activity/stats'
import {
  DEMO_ACTIVITY_PLAYERS,
  DEMO_PLAY_NAMES,
  demoDays,
  demoProgress,
  demoTotals,
} from './demoActivity'
import { TeamShell } from './TeamShell'

interface Dashboard {
  players: RosterEntry[]
  totals: ActivityTotals[]
  progress: AssignmentProgress[]
}

type Load =
  { status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; data: Dashboard }

const SELECT =
  'h-9 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * /team/activity: who studied this week. Mental reps (plays watched to the end in POV)
 * lead; time is supporting. Filters by position group, side and assignment, a not-started
 * and overdue list per assignment, and a day-by-day view per player. With no backend it
 * shows a demo dataset.
 */
export function ActivityPage({ now: nowProp }: { now?: Date }) {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const demo = supabase == null
  const teamId = snap.teamId
  const [now] = useState(() => nowProp ?? new Date())
  const [weekIndex, setWeekIndex] = useState(0)
  const week = useMemo(() => weekOf(now, weekIndex), [now, weekIndex])
  const [filter, setFilter] = useState<RowFilter>({
    group: 'all',
    side: 'all',
    assignmentId: 'all',
  })
  const [sort, setSort] = useState<SortKey>('least')
  const [selected, setSelected] = useState<string | null>(null)
  const [fetched, setFetched] = useState<(Load & { key: string }) | null>(null)
  const key = `${teamId ?? ''}:${week.from}`

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (demo || teamId == null) return
    let dead = false
    Promise.all([
      listTeamPlayers(teamId),
      loadActivityTotals(teamId, week.from, week.to),
      loadAssignmentProgress(teamId),
    ])
      .then(([players, totals, progress]) => {
        if (!dead) setFetched({ key, status: 'ready', data: { players, totals, progress } })
      })
      .catch((err: unknown) => {
        if (!dead) {
          setFetched({
            key,
            status: 'error',
            text: err instanceof Error ? err.message : 'Could not load activity',
          })
        }
      })
    return () => {
      dead = true
    }
  }, [demo, teamId, week, key])

  const demoData = useMemo<Dashboard | null>(
    () =>
      demo
        ? {
            players: DEMO_ACTIVITY_PLAYERS,
            totals: demoTotals(week, weekIndex),
            progress: demoProgress(now),
          }
        : null,
    [demo, week, weekIndex, now],
  )
  const load: Load =
    demoData != null
      ? { status: 'ready', data: demoData }
      : fetched != null && fetched.key === key
        ? fetched
        : { status: 'loading' }

  const data = load.status === 'ready' ? load.data : null
  const rows = useMemo(
    () => (data == null ? [] : buildRows(data.players, data.totals, data.progress, now)),
    [data, now],
  )
  const shown = sortRows(filterRows(rows, filter, data?.progress ?? []), sort)
  const summary = summarize(shown)
  const assignments = followUps(data?.progress ?? [], data?.players ?? [], now)
  const visibleFollowUps =
    filter.assignmentId === 'all'
      ? assignments
      : assignments.filter((item) => item.assignmentId === filter.assignmentId)
  const selectedRow = rows.find((row) => row.userId === selected) ?? null

  return (
    <TeamShell title="Activity" snap={snap} demo={demo} wide>
      {demo ? (
        <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Demo data. With a team backend this shows your players&apos; real study.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Week">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md border hover:bg-accent"
            aria-label="Previous week"
            onClick={() => setWeekIndex((n) => n - 1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 px-2 text-center text-sm font-medium" data-testid="week-label">
            {weekIndex === 0 ? 'This week' : week.label}
          </span>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md border hover:bg-accent disabled:opacity-40"
            aria-label="Next week"
            disabled={weekIndex >= 0}
            onClick={() => setWeekIndex((n) => Math.min(0, n + 1))}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <label className="sr-only" htmlFor="activity-group">
            Position group
          </label>
          <select
            id="activity-group"
            className={SELECT}
            value={filter.group}
            onChange={(event) =>
              setFilter({ ...filter, group: event.target.value as PositionGroup | 'all' })
            }
          >
            <option value="all">All positions</option>
            {POSITION_GROUPS.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="activity-side">
            Side
          </label>
          <select
            id="activity-side"
            className={SELECT}
            value={filter.side}
            onChange={(event) =>
              setFilter({ ...filter, side: event.target.value as RowFilter['side'] })
            }
          >
            <option value="all">Both sides</option>
            <option value="offense">Offense</option>
            <option value="defense">Defense</option>
            <option value="special">Special teams</option>
          </select>
          <label className="sr-only" htmlFor="activity-assignment">
            Assignment
          </label>
          <select
            id="activity-assignment"
            className={cn(SELECT, 'max-w-full')}
            value={filter.assignmentId}
            onChange={(event) => setFilter({ ...filter, assignmentId: event.target.value })}
          >
            <option value="all">All assignments</option>
            {assignments.map((item) => (
              <option key={item.assignmentId} value={item.assignmentId}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="activity-sort">
            Sort
          </label>
          <select
            id="activity-sort"
            className={SELECT}
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            <option value="least">Least active first</option>
            <option value="most">Most active first</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {load.status === 'loading' ? <p className="loading-line">Loading…</p> : null}
      {load.status === 'error' ? <p className="auth-error">{load.text}</p> : null}

      {data != null ? (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="activity-summary">
            <Tile label="Players active" value={`${summary.active} / ${summary.players}`} />
            <Tile label="POV reps" value={String(summary.povReps)} />
            <Tile label="Study time" value={formatDuration(summary.studySeconds)} />
            <Tile
              label="Assignments done"
              value={`${summary.assignmentsDone} / ${summary.assignmentsTotal}`}
              note={summary.overdue > 0 ? `${summary.overdue} overdue` : undefined}
            />
          </dl>

          {selectedRow != null && teamId != null ? (
            <PlayerDetail
              key={`${selectedRow.userId}:${week.from}`}
              row={selectedRow}
              teamId={teamId}
              week={week}
              weekIndex={weekIndex}
              demo={demo}
              progress={data.progress.filter((item) => item.userId === selectedRow.userId)}
              now={now}
              onClose={() => setSelected(null)}
            />
          ) : selectedRow != null && demo ? (
            <PlayerDetail
              key={`${selectedRow.userId}:${week.from}`}
              row={selectedRow}
              teamId="demo"
              week={week}
              weekIndex={weekIndex}
              demo
              progress={data.progress.filter((item) => item.userId === selectedRow.userId)}
              now={now}
              onClose={() => setSelected(null)}
            />
          ) : null}

          <section aria-labelledby="activity-players" className="mb-8">
            <h2 id="activity-players" className="mb-3 text-base font-semibold">
              Players
            </h2>
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No players match these filters.</p>
            ) : (
              <>
                <PlayerTable rows={shown} now={now} onPick={setSelected} />
                <PlayerCards rows={shown} now={now} onPick={setSelected} />
              </>
            )}
          </section>

          <section aria-labelledby="activity-assignments">
            <h2 id="activity-assignments" className="mb-3 text-base font-semibold">
              Assignments
            </h2>
            {visibleFollowUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No playbook assignments yet.</p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2" data-testid="follow-ups">
                {visibleFollowUps.map((item) => (
                  <li key={item.assignmentId} className="rounded-xl border bg-card p-4">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold break-words">{item.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {item.dueAt != null ? `Due ${dueLabel(item.dueAt)}` : 'No due date'} ·{' '}
                        {item.done} / {item.total} done
                      </span>
                    </div>
                    <NameList title="Not started" names={item.notStarted} tone="muted" />
                    <NameList title="Overdue" names={item.overdue} tone="alert" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </TeamShell>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note != null ? <dd className="text-xs font-medium text-destructive">{note}</dd> : null}
    </div>
  )
}

function NameList({
  title,
  names,
  tone,
}: {
  title: string
  names: string[]
  tone: 'muted' | 'alert'
}) {
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title} ({names.length})
      </p>
      {names.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {names.map((name) => (
            <li
              key={name}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                tone === 'alert' && 'border-destructive/40 text-destructive',
              )}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function assignmentText(row: PlayerRow): string {
  if (row.assigned === 0) return '—'
  return `${row.done} / ${row.assigned}`
}

function mixText(row: PlayerRow): string {
  const share = povShare(row.totals)
  return share == null ? '—' : `${Math.round(share * 100)}% POV`
}

/** Wide screens: one row per player. */
function PlayerTable({
  rows,
  now,
  onPick,
}: {
  rows: PlayerRow[]
  now: Date
  onPick: (id: string) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <table className="w-full text-sm" data-testid="activity-table">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Player</th>
            <th className="px-3 py-2 font-medium">Pos</th>
            <th className="px-3 py-2 text-right font-medium">POV reps</th>
            <th className="px-3 py-2 text-right font-medium">POV time</th>
            <th className="px-3 py-2 text-right font-medium">Playbook time</th>
            <th className="px-3 py-2 text-right font-medium">Camera mix</th>
            <th className="px-3 py-2 text-right font-medium">Plays opened</th>
            <th className="px-3 py-2 text-right font-medium">Assignments</th>
            <th className="px-3 py-2 font-medium">Last active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="border-t hover:bg-accent/50">
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => onPick(row.userId)}
                >
                  {row.name}
                </button>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.position ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.totals.povReps}
                {row.totals.ownSlotReps < row.totals.povReps ? (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    ({row.totals.ownSlotReps} own)
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatDuration(row.totals.povSeconds)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatDuration(row.totals.playbookSeconds)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">{mixText(row)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.totals.playsOpened}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {assignmentText(row)}
                {row.overdue > 0 ? (
                  <span className="ml-1 text-xs font-medium text-destructive">
                    {row.overdue} overdue
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {lastActiveLabel(row.totals.lastDay, now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Phones: the table collapses to one card per player, no sideways scroll. */
function PlayerCards({
  rows,
  now,
  onPick,
}: {
  rows: PlayerRow[]
  now: Date
  onPick: (id: string) => void
}) {
  return (
    <ul className="grid gap-2 md:hidden" data-testid="activity-cards">
      {rows.map((row) => (
        <li key={row.userId}>
          <button
            type="button"
            className="w-full rounded-xl border bg-card p-3 text-left hover:bg-accent/50"
            onClick={() => onPick(row.userId)}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-semibold">{row.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.position ?? '—'} · {lastActiveLabel(row.totals.lastDay, now)}
              </span>
            </span>
            <span className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <Stat label="POV reps" value={String(row.totals.povReps)} />
              <Stat label="POV time" value={formatDuration(row.totals.povSeconds)} />
              <Stat label="Playbook" value={formatDuration(row.totals.playbookSeconds)} />
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">
              Assignments {assignmentText(row)}
              {row.overdue > 0 ? (
                <span className="font-medium text-destructive"> · {row.overdue} overdue</span>
              ) : null}
              {' · '}
              {mixText(row)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="block min-w-0">
      <span className="block text-muted-foreground">{label}</span>
      <span className="block text-sm font-semibold tabular-nums">{value}</span>
    </span>
  )
}

type DetailLoad =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; days: ActivityDay[]; names: Map<string, string> }

/** One player's week: time and reps per day, plays watched and from which position. */
function PlayerDetail({
  row,
  teamId,
  week,
  weekIndex,
  demo,
  progress,
  now,
  onClose,
}: {
  row: PlayerRow
  teamId: string
  week: Week
  weekIndex: number
  demo: boolean
  progress: AssignmentProgress[]
  now: Date
  onClose: () => void
}) {
  const [load, setLoad] = useState<DetailLoad>(() =>
    demo
      ? { status: 'ready', days: demoDays(row.userId, week, weekIndex), names: DEMO_PLAY_NAMES }
      : { status: 'loading' },
  )

  useEffect(() => {
    if (demo) return
    let dead = false
    loadActivityDays(teamId, row.userId, week.from, week.to)
      .then(async (days) => {
        const names = await loadPlayNames([...new Set(days.map((day) => day.playId))])
        if (!dead) setLoad({ status: 'ready', days, names })
      })
      .catch((err: unknown) => {
        if (!dead) {
          setLoad({
            status: 'error',
            text: err instanceof Error ? err.message : 'Could not load this player',
          })
        }
      })
    return () => {
      dead = true
    }
  }, [demo, teamId, row.userId, week.from, week.to])

  const days = load.status === 'ready' ? load.days : []
  const perDay = week.days.map((day) => {
    const rows = days.filter((item) => item.day === day)
    return {
      day,
      seconds: rows.reduce((sum, item) => sum + item.seconds, 0),
      reps: rows
        .filter((item) => item.kind === 'pov')
        .reduce((sum, item) => sum + item.runsCompleted, 0),
    }
  })
  const most = Math.max(1, ...perDay.map((item) => item.seconds))
  const plays = new Map<string, { pov: number; reps: number; slots: Set<string>; time: number }>()
  for (const item of days) {
    const entry = plays.get(item.playId) ?? { pov: 0, reps: 0, slots: new Set(), time: 0 }
    entry.time += item.seconds
    if (item.kind === 'pov') {
      entry.pov += item.seconds
      entry.reps += item.runsCompleted
      if (item.slot !== '') entry.slots.add(item.slot)
    }
    plays.set(item.playId, entry)
  }

  return (
    <section
      className="mb-6 rounded-xl border bg-card p-4"
      aria-labelledby="activity-detail"
      data-testid="activity-detail"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="activity-detail" className="truncate text-base font-semibold">
            {row.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {row.position ?? 'No position'} · {formatDuration(studySeconds(row.totals))} studied ·{' '}
            {row.totals.povReps} POV reps
          </p>
        </div>
        <button
          type="button"
          className="grid size-9 shrink-0 place-items-center rounded-md border hover:bg-accent"
          aria-label="Close player"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      {load.status === 'loading' ? <p className="loading-line">Loading…</p> : null}
      {load.status === 'error' ? <p className="auth-error">{load.text}</p> : null}

      <h3 className="mb-2 text-sm font-semibold">Day by day</h3>
      <ol className="mb-4 grid gap-1">
        {perDay.map((item) => (
          <li key={item.day} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {new Date(`${item.day}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'short',
              })}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(item.seconds / most) * 100}%` }}
              />
            </span>
            <span className="tabular-nums">
              {formatDuration(item.seconds)} · {item.reps} reps
            </span>
          </li>
        ))}
      </ol>

      <h3 className="mb-2 text-sm font-semibold">Plays</h3>
      {plays.size === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No plays opened this week.</p>
      ) : (
        <ul className="mb-4 grid gap-1 text-sm">
          {[...plays.entries()].map(([playId, entry]) => (
            <li key={playId} className="flex flex-wrap justify-between gap-x-3">
              <span className="min-w-0 font-medium break-words">
                {(load.status === 'ready' ? load.names.get(playId) : null) ?? 'A play'}
              </span>
              <span className="text-muted-foreground">
                {entry.reps} reps · {formatDuration(entry.time)}
                {entry.slots.size > 0 ? ` · as ${[...entry.slots].map(slotLabel).join(', ')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-sm font-semibold">Assignments</h3>
      {progress.length === 0 ? (
        <p className="mb-2 text-sm text-muted-foreground">Nothing assigned.</p>
      ) : (
        <ul className="mb-2 grid gap-1 text-sm">
          {progress.map((item) => {
            const state = assignmentState(item)
            return (
              <li key={item.assignmentId} className="flex flex-wrap justify-between gap-x-3">
                <span className="min-w-0 break-words">{item.playbookName}</span>
                <span
                  className={cn(
                    'text-muted-foreground',
                    isOverdue(item, now) && 'font-medium text-destructive',
                  )}
                >
                  {state === 'done'
                    ? 'Done'
                    : state === 'not_started'
                      ? 'Not started'
                      : `${item.playsRepped} / ${item.playsTotal} repped`}
                  {isOverdue(item, now) ? ' · overdue' : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <Link
        to={`/team/depth?user=${encodeURIComponent(row.userId)}`}
        className="text-sm font-medium text-primary hover:underline"
      >
        Depth chart and notes
      </Link>
    </section>
  )
}
