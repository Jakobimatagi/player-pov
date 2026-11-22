import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import {
  loadActivityDays,
  loadActivityTotals,
  loadAssignmentProgress,
  type ActivityTotals,
  type AssignmentProgress,
} from '../data/activity'
import { localDay } from '../activity/meter'
import {
  assignmentState,
  emptyTotals,
  formatDuration,
  isOverdue,
  streak,
  studySeconds,
  weekOf,
} from '../activity/stats'

export interface MyActivity {
  totals: ActivityTotals
  progress: AssignmentProgress[]
  /** Days with any activity in the last four weeks, yyyy-mm-dd. */
  activeDays: string[]
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: MyActivity }

/**
 * A player's own study this week, on Player Home: the same numbers their coaches see,
 * so nothing is measured behind their back.
 */
export function PlayerActivityCard({
  teamId,
  userId,
  now: nowProp,
  initial,
}: {
  teamId: string | null
  userId: string | null
  now?: Date
  /** Rendered data for tests and fixtures; skips the fetch. */
  initial?: MyActivity
}) {
  const [now] = useState(() => nowProp ?? new Date())
  const [load, setLoad] = useState<Load>(
    initial != null ? { status: 'ready', data: initial } : { status: 'loading' },
  )

  useEffect(() => {
    if (initial != null || teamId == null || userId == null) return
    let dead = false
    const week = weekOf(now)
    const since = new Date(now)
    since.setDate(since.getDate() - 28)
    Promise.all([
      loadActivityTotals(teamId, week.from, week.to),
      loadAssignmentProgress(teamId),
      loadActivityDays(teamId, userId, localDay(since), localDay(now)),
    ])
      .then(([totals, progress, days]) => {
        if (dead) return
        setLoad({
          status: 'ready',
          data: {
            totals: totals.find((row) => row.userId === userId) ?? emptyTotals(userId),
            progress: progress.filter((row) => row.userId === userId),
            activeDays: [...new Set(days.map((row) => row.day))],
          },
        })
      })
      .catch(() => {
        if (!dead) setLoad({ status: 'error' })
      })
    return () => {
      dead = true
    }
  }, [initial, teamId, userId, now])

  if (load.status === 'loading') return null
  if (load.status === 'error') {
    return (
      <p className="mb-4 text-sm text-muted-foreground">Couldn&apos;t load your study stats.</p>
    )
  }
  const { totals, progress, activeDays } = load.data
  const left = progress.filter((item) => assignmentState(item) !== 'done')
  const overdue = progress.filter((item) => isOverdue(item, now)).length
  const days = streak(activeDays, now)

  return (
    <section
      className="mb-6 rounded-xl border bg-card p-4"
      aria-labelledby="my-activity"
      data-testid="my-activity"
    >
      <h2 id="my-activity" className="mb-3 text-base font-semibold">
        Your study this week
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="POV reps" value={String(totals.povReps)} />
        <Figure label="Study time" value={formatDuration(studySeconds(totals))} />
        <Figure label="Streak" value={`${days} ${days === 1 ? 'day' : 'days'}`} />
        <Figure
          label="Assignments left"
          value={String(left.length)}
          note={overdue > 0 ? `${overdue} overdue` : undefined}
        />
      </dl>
      <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
        <Eye className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Your coaches see these numbers: time on play sheets, time in the 3D viewer by camera,
          plays watched to the end and which position you watched as. Only time with this tab open
          and in use counts. Teammates can&apos;t see them.
        </span>
      </p>
    </section>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {note != null ? <dd className="text-xs font-medium text-destructive">{note}</dd> : null}
    </div>
  )
}
