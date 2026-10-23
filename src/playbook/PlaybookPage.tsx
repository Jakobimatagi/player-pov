import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { AccountMenu } from '../app/AccountMenu'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import type { PlaybookRow, PlayRow } from '../data/plays'
import {
  deletePlay,
  listArchivedPlays,
  listPlaybooks,
  listPlays,
  renamePlay,
  restorePlay,
} from '../data/plays'
import { supabase } from '../data/supabase'
import {
  afterRestore,
  DEMO_ARCHIVED,
  DEMO_PLAYS,
  honorDemoRoster,
  listStatus,
  visiblePlays,
} from './archive'

const TABS = ['Team', 'Playbooks', 'Plays', 'Scout', 'Homework'] as const

const DEMO_BOOKS: PlaybookRow[] = [{ id: 'pb1', name: 'PB1', playCount: 1 }]

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
  const fixture =
    supabase == null || honorDemoRoster(params.get('roster'), supabase != null, import.meta.env.DEV)
  const playerView =
    params.get('roster') === 'player' || (supabase != null && snap.role === 'player')
  const staff = !playerView && (fixture || snap.role === 'head_coach' || snap.role === 'coach')
  const [plays, setPlays] = useState<PlayRow[]>(() =>
    fixture ? DEMO_PLAYS.filter((play) => (playerView ? play.playbookId != null : true)) : [],
  )
  const [archived, setArchived] = useState<PlayRow[]>(() => (fixture && staff ? DEMO_ARCHIVED : []))
  const [books, setBooks] = useState<PlaybookRow[]>(fixture ? DEMO_BOOKS : [])
  const [bookId, setBookId] = useState<string | null>(null)
  const [list, setList] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const viewingArchived = staff && list === 'archived'
  const fetchKey =
    fixture || supabase == null || snap.session == null || snap.teamId == null
      ? null
      : `${snap.teamId}\0${bookId ?? ''}\0${staff ? '1' : '0'}`
  const loading = !fixture && (fetchKey == null || fetchKey !== settledKey)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (fetchKey == null || supabase == null || snap.teamId == null) return
    let dead = false
    const teamId = snap.teamId
    const key = fetchKey
    void (async () => {
      try {
        const [nextPlays, nextBooks, nextArchived] = await Promise.all([
          listPlays(teamId, bookId ?? undefined),
          listPlaybooks(teamId),
          staff ? listArchivedPlays(teamId) : Promise.resolve([] as PlayRow[]),
        ])
        if (dead) return
        setPlays(nextPlays)
        setBooks(nextBooks)
        setArchived(nextArchived)
      } catch (error) {
        if (!dead) setNotice(error instanceof Error ? error.message : 'Could not load plays')
      } finally {
        if (!dead) setSettledKey(key)
      }
    })()
    return () => {
      dead = true
    }
  }, [bookId, fetchKey, snap.teamId, staff])

  if (!fixture && snap.ready && snap.session == null) {
    return <Navigate to="/login?next=/playbook" replace />
  }

  const shown = visiblePlays({
    staff,
    list,
    active: plays,
    archived,
    search,
  })
  const status = listStatus({ loading, count: shown.length, archived: viewingArchived })

  async function commitRename(playId: string) {
    const name = draftName.trim()
    if (name.length < 1) return
    if (!fixture) {
      try {
        await renamePlay(playId, name)
      } catch (error) {
        setSuccess(null)
        setNotice(error instanceof Error ? error.message : 'Rename failed')
        return
      }
    }
    setPlays((current) => current.map((play) => (play.id === playId ? { ...play, name } : play)))
    setRenaming(null)
    setNotice(null)
    setSuccess(null)
  }

  async function commitDelete(playId: string) {
    if (!fixture) {
      try {
        await deletePlay(playId)
      } catch (error) {
        setSuccess(null)
        setNotice(error instanceof Error ? error.message : 'Delete failed')
        return
      }
    }
    const removed = plays.find((play) => play.id === playId)
    setPlays((current) => current.filter((play) => play.id !== playId))
    if (removed != null && staff) {
      setArchived((current) => [...current, removed].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setNotice(null)
    setSuccess(null)
  }

  async function commitRestore(playId: string) {
    const view = { list, active: plays, archived, notice, success }
    if (!fixture) {
      try {
        await restorePlay(playId)
      } catch (error) {
        const next = afterRestore(view, playId, error)
        setNotice(next.notice)
        setSuccess(next.success)
        return
      }
    }
    const next = afterRestore(view, playId, null)
    setPlays(next.active)
    setArchived(next.archived)
    setList(next.list)
    setNotice(next.notice)
    setSuccess(next.success)
  }

  function selectBook(next: string | null) {
    setBookId(next)
    setList('active')
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
        <div className="roster-filters" role="group" aria-label="Playbook">
          <button
            type="button"
            aria-pressed={!viewingArchived && bookId == null}
            onClick={() => selectBook(null)}
          >
            All
          </button>
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              aria-pressed={!viewingArchived && bookId === book.id}
              onClick={() => selectBook(book.id)}
            >
              {book.name}
            </button>
          ))}
          {staff ? (
            <button
              type="button"
              aria-pressed={viewingArchived}
              onClick={() => {
                setList('archived')
                setBookId(null)
                setRenaming(null)
              }}
            >
              Archived
            </button>
          ) : null}
        </div>
        {success ? (
          <p className="playbook-success" role="status">
            {success}
          </p>
        ) : null}
        {notice ? (
          <p className="auth-error" role="alert">
            {notice}
          </p>
        ) : null}
        {status ? <p className={loading ? 'loading-line' : undefined}>{status}</p> : null}
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
                  {staff && viewingArchived ? (
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => void commitRestore(play.id)}
                    >
                      Restore
                    </button>
                  ) : null}
                  {staff && !viewingArchived ? (
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
                  {staff && !viewingArchived ? (
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
    </div>
  )
}
