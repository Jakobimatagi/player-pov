import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { App } from '../App'
import {
  destination,
  getAuthSnap,
  noteActivity,
  safeNext,
  startAuth,
  subscribeAuth,
} from '../auth/session'
import { supabase } from '../data/supabase'
import { AccountMenu } from './AccountMenu'

function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
}

export function SessionLayout() {
  const snap = useAuth()
  const location = useLocation()
  useEffect(() => {
    startAuth()
    const mark = () => noteActivity()
    window.addEventListener('pointerdown', mark)
    window.addEventListener('keydown', mark)
    return () => {
      window.removeEventListener('pointerdown', mark)
      window.removeEventListener('keydown', mark)
    }
  }, [])
  if (snap.expired && location.pathname !== '/login') {
    return <Navigate to="/login?expired=1" replace />
  }
  return <Outlet />
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  const snap = useAuth()
  const name = snap.session?.user.email ?? 'Account'
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <p className="wordmark">POV Playbook</p>
        <AccountMenu name={name} />
      </header>
      <main className="app-main">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  )
}

export function HomePage() {
  const snap = useAuth()
  const kind = destination({
    backend: supabase != null,
    ready: snap.ready,
    hasSession: snap.session != null,
    role: snap.role,
    membershipLoaded: snap.membershipLoaded,
    membershipError: snap.membershipError,
  })
  if (kind === 'viewer') return <App />
  if (kind === 'loading') return <p className="loading-line">Loading…</p>
  if (kind === 'login') return <Navigate to={`/login?next=${encodeURIComponent('/')}`} replace />
  if (kind === 'error') {
    return (
      <Shell title="Team">
        <p>Couldn&apos;t load your team.</p>
      </Shell>
    )
  }
  if (kind === 'player') {
    return (
      <Shell title="Player Home">
        <p>Nothing assigned yet. Check with your coach.</p>
      </Shell>
    )
  }
  if (kind === 'staff') {
    return (
      <Shell title="Coach home">
        <p>Playbooks open from the next step.</p>
      </Shell>
    )
  }
  return <CreateTeamPage />
}

export function CreateTeamPage() {
  const [note, setNote] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNote('Saving the team is the next step.')
  }

  return (
    <Shell title="Create team">
      <p>Ask your coach for an invite</p>
      <form className="auth-card stack-form" onSubmit={onSubmit}>
        <label className="auth-field">
          <span>Team name</span>
          <input name="name" required />
        </label>
        <label className="auth-field">
          <span>School</span>
          <input name="school" />
        </label>
        <label className="auth-field">
          <span>Season</span>
          <input name="season" placeholder="2026" />
        </label>
        <label className="auth-field">
          <span>Hash rule</span>
          <select name="hash" defaultValue="NFHS">
            <option>NFHS</option>
            <option>NCAA</option>
          </select>
        </label>
        <button className="auth-submit" type="submit">
          Create team
        </button>
        {note ? <p className="auth-note">{note}</p> : null}
      </form>
    </Shell>
  )
}

export function WatchPage() {
  const snap = useAuth()
  const location = useLocation()
  const kind = destination({
    backend: supabase != null,
    ready: snap.ready,
    hasSession: snap.session != null,
    role: snap.role,
    membershipLoaded: true,
    membershipError: false,
  })
  if (kind === 'loading') return <p className="loading-line">Loading…</p>
  if (kind === 'login') {
    const next = safeNext(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <App />
}
