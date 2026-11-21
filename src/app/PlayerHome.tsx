import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listAssignedPlays, type AssignedPlay } from '../data/slots'
import { AccountMenu } from './AccountMenu'
import './coachHome.css'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; plays: AssignedPlay[] }

/** Player home: the plays assigned to them, each opening on the play sheet at their position. */
export function PlayerHome({
  name,
  teamId,
  userId,
  initial,
}: {
  name: string
  teamId: string | null
  userId: string | null
  /** Rendered rows for tests and fixtures; skips the fetch. */
  initial?: AssignedPlay[]
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
    <div className="coach-frame coach-home">
      <div className="coach-main">
        <header className="roster-head">
          <h1>Player Home</h1>
          <AccountMenu name={name} />
        </header>
        {load.status === 'loading' && <p className="loading-line">Loading…</p>}
        {load.status === 'error' && <p>Couldn&apos;t load your plays.</p>}
        {load.status === 'ready' && load.plays.length === 0 && (
          <p>Nothing assigned yet. Check with your coach.</p>
        )}
        {load.status === 'ready' && load.plays.length > 0 && (
          <ul className="coach-home-cards" data-testid="player-plays">
            {load.plays.map((play) => (
              <li key={play.id}>
                <Link className="coach-home-card" to={`/plays/${play.id}`}>
                  <span className="coach-home-card-title">{play.name}</span>
                  <span className="coach-home-card-blurb">
                    {play.slot != null
                      ? `Your position: ${play.slot.toUpperCase()}`
                      : 'No position assigned yet'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
