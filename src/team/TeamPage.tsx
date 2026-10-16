import { useEffect, useState, type FormEvent } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, Navigate } from 'react-router'
import { getAuthSnap, subscribeAuth } from '../auth/session'
import { supabase } from '../data/supabase'
import type { PositionCode, TeamRole } from '../data/database.types'
import { AccountMenu } from '../app/AccountMenu'
import {
  CONSENT_HINT,
  CONSENT_STATEMENT,
  POSITIONS,
  revokeInvite,
  roleLabel,
  saveMember,
  submitInvite,
} from './invite'

type RosterRow = {
  user_id: string
  display_name: string
  position: PositionCode | null
  role: TeamRole
}

type OpenInvite = {
  id: string
  email: string
  display_name: string
  role: TeamRole
  position: PositionCode | null
}

function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
}

export function TeamPage() {
  const snap = useAuth()
  const teamId = snap.teamId
  const [teamName, setTeamName] = useState('Roster')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [rows, setRows] = useState<RosterRow[]>([])
  const [invites, setInvites] = useState<OpenInvite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [inviteRole, setInviteRole] = useState<TeamRole>('player')
  const [consent, setConsent] = useState(false)
  const headCoach = snap.role === 'head_coach'
  const isOwner = ownerId != null && ownerId === snap.session?.user.id

  useEffect(() => {
    if (supabase == null || teamId == null) return
    const client = supabase
    let cancelled = false
    void (async () => {
      const team = await client.from('teams').select('name, created_by').eq('id', teamId).limit(1)
      const roster = await client
        .from('roster_public')
        .select('user_id, display_name, position, role')
        .eq('team_id', teamId)
      if (cancelled) return
      if (team.error || roster.error) {
        setError("Couldn't load your team.")
        return
      }
      setTeamName(team.data?.[0]?.name ?? 'Roster')
      setOwnerId(team.data?.[0]?.created_by ?? null)
      setRows((roster.data ?? []) as RosterRow[])
      if (!headCoach) {
        setInvites([])
        return
      }
      const open = await client
        .from('invites')
        .select('id, email, display_name, role, position')
        .eq('team_id', teamId)
        .is('accepted_at', null)
      if (cancelled) return
      if (open.error) {
        setError("Couldn't load your team.")
        return
      }
      setInvites((open.data ?? []) as OpenInvite[])
    })()
    return () => {
      cancelled = true
    }
  }, [headCoach, reloadKey, teamId])

  if (!snap.ready || (snap.session != null && !snap.membershipLoaded)) {
    return <p className="loading-line">Loading…</p>
  }
  if (snap.session == null) return <Navigate to="/login?next=%2Fteam" replace />
  if (teamId == null) return <Navigate to="/" replace />

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (supabase == null || teamId == null) return
    const formEl = event.currentTarget
    const form = new FormData(formEl)
    const position = String(form.get('position') ?? '')
    setError(null)
    setLink(null)
    const result = await submitInvite(supabase, {
      teamId,
      email: String(form.get('email') ?? ''),
      name: String(form.get('name') ?? ''),
      role: inviteRole,
      position: position === '' ? null : (position as PositionCode),
      statement: inviteRole === 'player' && consent ? CONSENT_STATEMENT : '',
      origin: window.location.origin,
    })
    if (!result.ok) {
      setError(result.message)
      return
    }
    setLink(result.link)
    setConsent(false)
    setReloadKey((value) => value + 1)
    formEl.reset()
  }

  async function onRevoke(id: string) {
    if (supabase == null) return
    setError(null)
    const result = await revokeInvite(supabase, id)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setReloadKey((value) => value + 1)
  }

  async function onSave(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault()
    if (supabase == null || teamId == null) return
    const client = supabase
    const form = new FormData(event.currentTarget)
    const role = String(form.get('role') ?? 'player') as TeamRole
    const position = String(form.get('position') ?? '')
    setError(null)
    const values = {
      role,
      position: position === '' ? null : (position as PositionCode),
    }
    const result = await saveMember(
      (next) => client.from('memberships').update(next).eq('team_id', teamId).eq('user_id', userId),
      values,
    )
    if (!result.ok) {
      setError(result.message)
      return
    }
    setReloadKey((value) => value + 1)
  }

  async function copyLink() {
    if (link == null) return
    await navigator.clipboard.writeText(link)
  }

  const name = snap.session.user.email ?? 'Account'

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <p className="wordmark">POV Playbook</p>
        <AccountMenu name={name} />
      </header>
      <main className="app-main team-page">
        <h1>{teamName}</h1>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="roster">
          {rows.map((row) => (
            <li key={row.user_id} className="roster-row">
              <p className="roster-name">{row.display_name}</p>
              {headCoach && row.user_id !== snap.session?.user.id ? (
                <form className="roster-edit" onSubmit={(event) => void onSave(event, row.user_id)}>
                  <label>
                    <select
                      name="role"
                      aria-label={`Role for ${row.display_name}`}
                      defaultValue={row.role}
                    >
                      <option value="player">Player</option>
                      <option value="coach">Coach</option>
                      {isOwner || row.role === 'head_coach' ? (
                        <option value="head_coach">Head coach</option>
                      ) : null}
                    </select>
                  </label>
                  <label>
                    <select
                      name="position"
                      aria-label={`Position for ${row.display_name}`}
                      defaultValue={row.position ?? ''}
                    >
                      <option value="">Position</option>
                      {POSITIONS.map((code) => (
                        <option key={code}>{code}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">Save</button>
                </form>
              ) : (
                <p className="roster-meta">
                  {roleLabel(row.role)}
                  {row.position ? ` · ${row.position}` : ''}
                </p>
              )}
            </li>
          ))}
        </ul>

        {headCoach ? (
          <section className="invite-panel">
            <h2>Invite</h2>
            <form onSubmit={(event) => void onInvite(event)}>
              <label className="auth-field">
                <span>Name</span>
                <input name="name" required />
              </label>
              <label className="auth-field">
                <span>Email</span>
                <input name="email" type="email" required />
              </label>
              <div className="invite-pair">
                <label className="auth-field">
                  <span>Role</span>
                  <select
                    name="role"
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                  >
                    <option value="player">Player</option>
                    <option value="coach">Coach</option>
                    {isOwner ? <option value="head_coach">Head coach</option> : null}
                  </select>
                </label>
                <label className="auth-field">
                  <span>Position</span>
                  <select name="position" defaultValue="WR">
                    <option value="">None</option>
                    {POSITIONS.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </label>
              </div>
              {inviteRole === 'player' ? (
                <label className="invite-consent">
                  <input
                    name="consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    {CONSENT_HINT}. {CONSENT_STATEMENT}
                  </span>
                </label>
              ) : null}
              <button
                className="auth-submit"
                type="submit"
                disabled={inviteRole === 'player' && !consent}
              >
                Create link
              </button>
            </form>
            {link ? (
              <div className="team-link-row">
                <label className="auth-field">
                  <span>Invite link</span>
                  <input readOnly value={link} />
                </label>
                <button type="button" onClick={() => void copyLink()}>
                  Copy link
                </button>
              </div>
            ) : null}
            <h2>Open invites</h2>
            <ul className="roster">
              {invites.map((invite) => (
                <li key={invite.id} className="roster-row">
                  <p className="roster-name">{invite.display_name}</p>
                  <p className="roster-meta">{invite.email}</p>
                  <p className="roster-meta">
                    {roleLabel(invite.role)}
                    {invite.position ? ` · ${invite.position}` : ''}
                  </p>
                  <button type="button" onClick={() => void onRevoke(invite.id)}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="auth-note">
            <Link to="/">Home</Link>
          </p>
        )}
      </main>
    </div>
  )
}
