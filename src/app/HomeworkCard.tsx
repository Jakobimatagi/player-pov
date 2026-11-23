import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Crosshair } from 'lucide-react'
import { dueLabel } from '../data/assignments'
import { loadHomework, type Homework } from '../data/reps'
import { supabase } from '../data/supabase'
import { demoHomework } from '../reps/demo'
import { homeworkState, sortHomework, yardsLabel, type HomeworkState } from '../reps/target'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Homework[] }

const STATE: Record<HomeworkState, { tone: string; text: string }> = {
  todo: { tone: 'todo', text: 'Not started' },
  retry: { tone: 'retry', text: 'Try again' },
  overdue: { tone: 'overdue', text: 'Overdue' },
  passed: { tone: 'pass', text: 'Passed' },
}

/**
 * Scout reps assigned to the signed-in player, on Player Home. Each opens the rep on the
 * board. Without a backend it shows demo homework.
 */
export function HomeworkCard({
  teamId,
  userId,
  initial,
  now: nowProp,
}: {
  teamId: string | null
  userId: string | null
  /** Rendered rows for tests and fixtures; skips the fetch. */
  initial?: Homework[]
  now?: Date
}) {
  const [now] = useState(() => nowProp ?? new Date())
  const [load, setLoad] = useState<Load>(() =>
    initial != null
      ? { status: 'ready', items: initial }
      : supabase == null
        ? { status: 'ready', items: demoHomework() }
        : { status: 'loading' },
  )

  useEffect(() => {
    if (initial != null || supabase == null || teamId == null || userId == null) return
    let dead = false
    loadHomework(teamId)
      .then((items) => {
        if (!dead) setLoad({ status: 'ready', items })
      })
      .catch(() => {
        if (!dead) setLoad({ status: 'error' })
      })
    return () => {
      dead = true
    }
  }, [initial, teamId, userId])

  if (load.status === 'loading') return null
  if (load.status === 'error') {
    return <p className="mb-4 text-sm text-muted-foreground">Couldn&apos;t load your homework.</p>
  }
  if (load.items.length === 0) return null
  const items = sortHomework(load.items, now)
  const left = items.filter((item) => !item.passed).length

  return (
    <section className="mb-6" aria-labelledby="my-homework" data-testid="homework">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="my-homework" className="text-base font-semibold">
          Homework
        </h2>
        <span className="text-sm text-muted-foreground">
          {left === 0 ? 'All done' : `${left} to do`}
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const state = homeworkState(item, now)
          const badge = STATE[state]
          return (
            <li key={item.assignmentId}>
              <Link
                className="group flex h-full items-center gap-4 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-foreground/20 hover:bg-accent/60 focus-visible:focus-ring"
                to={`/homework/${item.assignmentId}`}
                data-state={state}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Crosshair className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.playName}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    vs {item.lookName} · You’re {item.slot.toUpperCase()}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={
                        state === 'overdue'
                          ? 'font-medium text-destructive'
                          : state === 'passed'
                            ? 'font-medium text-[var(--success)]'
                            : state === 'retry'
                              ? 'font-medium text-[var(--gold)]'
                              : 'text-muted-foreground'
                      }
                    >
                      {badge.text}
                    </span>
                    <span className="text-muted-foreground">
                      {item.dueAt != null ? `Due ${dueLabel(item.dueAt)}` : 'No due date'}
                      {item.bestDistance != null && !item.passed
                        ? ` · best ${yardsLabel(item.bestDistance)}`
                        : ''}
                    </span>
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
