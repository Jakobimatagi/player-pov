import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listAssignedPlays, type AssignedPlay } from '../data/slots'
import { ChevronRight, Clapperboard, Play } from 'lucide-react'
import { CoachLayout } from './CoachLayout'
import { PlayerActivityCard, type MyActivity } from './PlayerActivityCard'
import { HomeworkCard } from './HomeworkCard'
import { MyDepthCard } from './MyDepthCard'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; plays: AssignedPlay[] }

/** Player home: the plays assigned to them, each opening on the play sheet at their position. */
export function PlayerHome({
  name,
  teamId,
  userId,
  initial,
  initialActivity,
}: {
  name: string
  teamId: string | null
  userId: string | null
  /** Rendered rows for tests and fixtures; skips the fetch. */
  initial?: AssignedPlay[]
  /** Rendered study stats for tests and fixtures. */
  initialActivity?: MyActivity
}) {
  const [load, setLoad] = useState<Load>(
    initial != null ? { status: 'ready', plays: initial } : { status: 'loading' },
  )

  useEffect(() => {
    if (initial != null || teamId == null || userId == null) return
    let dead = false
    listAssignedPlays(teamId, userId)
      .then((plays) => {
        if (!dead) setLoad({ status: 'ready', plays })
      })
      .catch(() => {
        if (!dead) setLoad({ status: 'error' })
      })
    return () => {
      dead = true
    }
  }, [initial, teamId, userId])

  return (
    <CoachLayout title="Player Home" eyebrow="Your plays" account={name} nav={false}>
      <PlayerActivityCard teamId={teamId} userId={userId} initial={initialActivity} />
      <HomeworkCard teamId={teamId} userId={userId} />
      <MyDepthCard teamId={teamId} userId={userId} />
      {load.status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
      {load.status === 'error' && <p>Couldn&apos;t load your plays.</p>}
      {load.status === 'ready' && load.plays.length === 0 && (
        <div className="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <Clapperboard className="mb-3 size-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            No published plays for you yet. Check with your coach.
          </p>
        </div>
      )}
      {load.status === 'ready' && load.plays.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="player-plays">
          {load.plays.map((play) => (
            <li key={play.id}>
              <Link
                className="group flex h-full items-center gap-4 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-foreground/20 hover:bg-accent/60 focus-visible:focus-ring"
                to={`/plays/${play.id}`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Play className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{play.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {play.slot != null
                      ? `Your position: ${play.slot.toUpperCase()}`
                      : 'No position assigned yet'}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CoachLayout>
  )
}
