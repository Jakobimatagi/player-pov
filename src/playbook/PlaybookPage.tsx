import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { AccountMenu } from '../app/AccountMenu'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import type { PlaybookRow, PlayRow } from '../data/plays'
import { deletePlay, listPlaybooks, listPlays, renamePlay } from '../data/plays'
import { supabase } from '../data/supabase'

const TABS = ['Team', 'Playbooks', 'Plays', 'Scout', 'Homework'] as const

const DEMO_BOOKS: PlaybookRow[] = [{ id: 'pb1', name: 'PB1', playCount: 1 }]

const DEMO_PLAYS: (PlayRow & { playbookId: string | null })[] = [
  {
    id: 'flood',
    team_id: 'demo',
    name: 'Flood',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    playbookId: 'pb1',
  },
  {
    id: 'iso',
    team_id: 'demo',
    name: 'Iso',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    playbookId: null,
  },
]

function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
}

function tabHref(tab: (typeof TABS)[number]): string {
  if (tab === 'Team') return '/team'
  if (tab === 'Playbooks') return '/playbook'
  return '/team'
}

export function PlaybookPage() {
  const snap = useAuth()
  const [params] = useSearchParams()
  const fixture = supabase == null || params.get('roster') === 'demo'
  const playerView =
    params.get('roster') === 'player' || (supabase != null && snap.role === 'player')
  const staff = !playerView && (fixture || snap.role === 'head_coach' || snap.role === 'coach')
  const [plays, setPlays] = useState<PlayRow[]>(() =>
    fixture ? DEMO_PLAYS.filter((play) => (playerView ? play.playbookId != null : true)) : [],
  )
  const [books, setBooks] = useState<PlaybookRow[]>(fixture ? DEMO_BOOKS : [])
  const [bookId, setBookId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (fixture || supabase == null || snap.session == null || snap.teamId == null) return
    let dead = false
    const teamId = snap.teamId
    void (async () => {
      try {
        const [nextPlays, nextBooks] = await Promise.all([
          listPlays(teamId, bookId ?? undefined),
          listPlaybooks(teamId),
        ])
        if (dead) return
        setPlays(nextPlays)
        setBooks(nextBooks)
      } catch (error) {
        if (!dead) setNotice(error instanceof Error ? error.message : 'Could not load plays')
      }
    })()
    return () => {
      dead = true
    }
  }, [bookId, fixture, snap.session, snap.teamId])

  if (!fixture && snap.ready && snap.session == null) {
    return <Navigate to="/login?next=/playbook" replace />
  }

  const shown = plays.filter((play) =>
    play.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  async function commitRename(playId: string) {
    const name = draftName.trim()
    if (name.length < 1) return
    if (!fixture) {
      try {
        await renamePlay(playId, name)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Rename failed')
        return
      }
    }
    setPlays((current) => current.map((play) => (play.id === playId ? { ...play, name } : play)))
    setRenaming(null)
    setNotice(null)
  }

  async function commitDelete(playId: string) {
    if (!fixture) {
      try {
        await deletePlay(playId)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Delete failed')
        return
      }
    }
    setPlays((current) => current.filter((play) => play.id !== playId))
    setNotice(null)
  }

  function selectBook(next: string | null) {
    setBookId(next)
    if (!fixture) return
    const pool = DEMO_PLAYS.filter((play) => (playerView ? play.playbookId != null : true))
    setPlays(next == null ? pool : pool.filter((play) => play.playbookId === next))
  }

  return (
    <div className="coach-frame playbook-page">
      {playerView ? null : (
        <nav className="side-nav" aria-label="Coach">
          {TABS.map((tab) => (
            <Link key={tab} to={tabHref(tab)}>
              {tab}
            </Link>
          ))}
        </nav>
      )}
      <div className="coach-main">
        <header className="roster-head">
          {playerView ? null : (
            <button
              type="button"
              className="nav-toggle"
              aria-label="Menu"
              onClick={() => setMenuOpen(true)}
            >
              Menu
            </button>
          )}
          <h1>Playbook</h1>
          <AccountMenu name={playerView ? 'Player' : (snap.session?.user.email ?? 'Coach Kim')} />
        </header>
        <input
          className="playbook-search"
          type="search"
          aria-label="Search plays"
          placeholder="Search plays"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="roster-filters" role="tablist" aria-label="Playbook">
          <button type="button" aria-pressed={bookId == null} onClick={() => selectBook(null)}>
            All
          </button>
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              aria-pressed={bookId === book.id}
              onClick={() => selectBook(book.id)}
            >
              {book.name}
            </button>
          ))}
        </div>
        {shown.length === 0 ? <p>No plays</p> : null}
        <ul className="playbook-list">
          {shown.map((play) => (
            <li key={play.id} className="playbook-row">
              <span className="playbook-name">{play.name}</span>
              {renaming === play.id ? (
                <form
                  className="playbook-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void commitRename(play.id)
                  }}
                >
                  <input
                    aria-label={`Name for ${play.name}`}
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                  <button type="submit" className="playbook-action">
                    Save name
                  </button>
                </form>
              ) : (
                <span className="playbook-actions">
                  <Link className="playbook-action" to={`/watch/${play.id}`}>
                    Watch
                  </Link>
                  {staff ? (
                    <Link className="playbook-action" to={`/plays/${play.id}/edit`}>
                      Edit play
                    </Link>
                  ) : null}
                  {staff ? (
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => {
                        setRenaming(play.id)
                        setDraftName(play.name)
                      }}
                    >
                      Rename
                    </button>
                  ) : null}
                  {staff ? (
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => void commitDelete(play.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </span>
              )}
            </li>
          ))}
        </ul>
        {notice ? <p className="auth-note">{notice}</p> : null}
      </div>
      {playerView ? null : (
        <nav className="tab-bar" aria-label="Coach">
          {TABS.map((tab) => (
            <Link key={tab} to={tabHref(tab)}>
              {tab}
            </Link>
          ))}
        </nav>
      )}
      {menuOpen ? (
        <div className="nav-drawer">
          <button type="button" className="nav-toggle" onClick={() => setMenuOpen(false)}>
            Close
          </button>
          {TABS.map((tab) => (
            <Link key={tab} to={tabHref(tab)} onClick={() => setMenuOpen(false)}>
              {tab}
            </Link>
          ))}
        </div>
      ) : null}
      {staff ? (
        <Link className="playbook-fab" to="/plays/new">
          New play
        </Link>
      ) : null}
    </div>
  )
}
