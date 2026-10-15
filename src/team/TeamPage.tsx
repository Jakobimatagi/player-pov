import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import type { PositionCode, TeamRole } from '../data/database.types'
import { supabase } from '../data/supabase'
import { AccountMenu } from '../app/AccountMenu'

type Row = {
  id: string
  name: string
  role: string
  roleCode: TeamRole
  position: string
  status: 'Active' | 'Pending' | 'Removed'
  kind: 'coach' | 'player' | 'pending'
  email?: string
}

const POSITIONS: PositionCode[] = [
  'QB',
  'RB',
  'FB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'CB',
  'S',
  'K',
  'ATH',
]

const DEMO: Row[] = [
  {
    id: 'kim',
    name: 'Coach Kim',
    role: 'Head coach',
    roleCode: 'head_coach',
    position: '—',
    status: 'Active',
    kind: 'coach',
  },
  {
    id: 'sam',
    name: 'Sam Lee',
    role: 'Player',
    roleCode: 'player',
    position: 'WR',
    status: 'Active',
    kind: 'player',
  },
  {
    id: 'alex',
    name: 'Alex Kim',
    role: 'Player',
    roleCode: 'player',
    position: 'QB',
    status: 'Pending',
    kind: 'pending',
    email: 'alex@example.com',
  },
]

const TABS = ['Team', 'Playbooks', 'Plays', 'Scout', 'Homework'] as const

function roleLabel(role: TeamRole): string {
  if (role === 'player') return 'Player'
  if (role === 'coach') return 'Coach'
  return 'Head coach'
}

function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
}

export function TeamPage() {
  const snap = useAuth()
  const [params] = useSearchParams()
  const playerView =
    params.get('roster') === 'player' || (supabase != null && snap.role === 'player')
  const fixture =
    supabase == null || params.get('roster') === 'demo' || params.get('roster') === 'player'
  const [rows, setRows] = useState<Row[]>(fixture ? DEMO : [])
  const [filter, setFilter] = useState<'All' | 'Coaches' | 'Players' | 'Pending'>('All')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [inviteRole, setInviteRole] = useState('player')
  const [notice, setNotice] = useState<string | null>(null)
  const headCoach = !playerView && (fixture || snap.role === 'head_coach')

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (fixture || supabase == null || snap.session == null) return
    let dead = false
    const client = supabase
    void (async () => {
      if (playerView) {
        const { data } = await client
          .from('roster_public')
          .select('user_id, display_name, position, role')
        if (dead || data == null) return
        setRows(
          data.map((row) => ({
            id: row.user_id,
            name: row.display_name,
            role: roleLabel(row.role),
            roleCode: row.role,
            position: row.position ?? '—',
            status: 'Active',
            kind: row.role === 'player' ? 'player' : 'coach',
          })),
        )
        return
      }
      const [{ data: members }, { data: profiles }, { data: invites }] = await Promise.all([
        client.from('memberships').select('user_id, role, position'),
        client.from('profiles').select('user_id, display_name'),
        client.from('invites').select('id, display_name, role, position, accepted_at, expires_at'),
      ])
      if (dead || members == null) return
      const names = new Map(
        (profiles ?? []).map((profile) => [profile.user_id, profile.display_name]),
      )
      const active: Row[] = members.map((row) => ({
        id: row.user_id,
        name: names.get(row.user_id) ?? 'Teammate',
        role: roleLabel(row.role),
        roleCode: row.role,
        position: row.position ?? '—',
        status: 'Active',
        kind: row.role === 'player' ? 'player' : 'coach',
      }))
      const pending: Row[] = (invites ?? [])
        .filter(
          (invite) =>
            invite.accepted_at == null && new Date(invite.expires_at).getTime() > Date.now(),
        )
        .map((invite) => ({
          id: invite.id,
          name: invite.display_name,
          role: roleLabel(invite.role),
          roleCode: invite.role,
          position: invite.position ?? '—',
          status: 'Pending',
          kind: 'pending',
        }))
      setRows([...active, ...pending])
    })()
    return () => {
      dead = true
    }
  }, [fixture, playerView, snap.session])

  if (!fixture && snap.ready && snap.session == null) {
    return <Navigate to="/login?next=/team" replace />
  }

  const shown = rows.filter((row) => {
    if (filter === 'All') return true
    if (filter === 'Coaches') return row.kind === 'coach'
    if (filter === 'Players') return row.kind === 'player'
    return row.status === 'Pending'
  })
  const menuRow = rows.find((row) => row.id === menuId) ?? null
  const onlyHeadCoach =
    rows.filter((row) => row.roleCode === 'head_coach' && row.status === 'Active').length <= 1

  async function sendInvite(form: FormData) {
    if (supabase == null || snap.session == null || snap.teamId == null) {
      setNotice('Invite needs a signed-in head coach.')
      setInviteOpen(false)
      return
    }
    const role = String(form.get('role') ?? 'player')
    if (role === 'player' && !consent) return
    const { error } = await supabase.functions.invoke('invite-member', {
      body: {
        teamId: snap.teamId,
        email: String(form.get('email') ?? ''),
        name: String(form.get('name') ?? ''),
        role,
        position: String(form.get('position') ?? '') || null,
        consent,
      },
    })
    setNotice(error ? error.message : 'Invite sent.')
    setInviteOpen(false)
  }

  async function runAction(
    action: 'resend' | 'revoke' | 'remove' | 'delete' | 'position',
    position?: string,
  ) {
    const row = menuRow
    if (row == null) return
    if (fixture || supabase == null || snap.teamId == null) {
      if (action === 'remove' && row.roleCode === 'head_coach' && onlyHeadCoach) {
        setNotice('cannot remove the last head coach')
        return
      }
      if (action === 'position' && position) {
        setRows((current) =>
          current.map((item) => (item.id === row.id ? { ...item, position } : item)),
        )
        setNotice(`${row.name} is now ${position}.`)
        setMenuId(null)
        return
      }
      if (action === 'remove') {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, status: 'Removed', kind: 'player' } : item,
          ),
        )
        setNotice('You no longer have access to this team')
        setMenuId(null)
        return
      }
      if (action === 'delete') {
        setRows((current) => current.filter((item) => item.id !== row.id))
        setNotice('Player data deleted.')
        setMenuId(null)
        return
      }
      if (action === 'revoke') {
        setRows((current) => current.filter((item) => item.id !== row.id))
        setNotice('This invite is no longer valid')
        setMenuId(null)
        return
      }
      setNotice('Invite sent.')
      setMenuId(null)
      return
    }
    const teamId = snap.teamId
    if (action === 'position' && position) {
      const { error } = await supabase.rpc('update_member', {
        p_team: teamId,
        p_user: row.id,
        p_role: row.roleCode,
        p_position: position as PositionCode,
      })
      setNotice(error ? error.message : `${row.name} is now ${position}.`)
      if (!error) {
        setRows((current) =>
          current.map((item) => (item.id === row.id ? { ...item, position } : item)),
        )
      }
      setMenuId(null)
      return
    }
    if (action === 'remove') {
      const { error } = await supabase.rpc('remove_member', { p_team: teamId, p_user: row.id })
      setNotice(error ? error.message : 'You no longer have access to this team')
      if (!error) {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, status: 'Removed', kind: 'player' } : item,
          ),
        )
      }
      setMenuId(null)
      return
    }
    if (action === 'delete') {
      const { error } = await supabase.rpc('delete_member_data', { p_team: teamId, p_user: row.id })
      setNotice(error ? error.message : 'Player data deleted.')
      if (!error) setRows((current) => current.filter((item) => item.id !== row.id))
      setMenuId(null)
      return
    }
    if (action === 'revoke') {
      const { error } = await supabase.rpc('revoke_invite', { p_invite: row.id })
      setNotice(error ? error.message : 'This invite is no longer valid')
      if (!error) setRows((current) => current.filter((item) => item.id !== row.id))
      setMenuId(null)
      return
    }
    const { error } = await supabase.functions.invoke('invite-member', {
      body: { resend: true, inviteId: row.id },
    })
    setNotice(error ? error.message : 'Invite sent.')
    setMenuId(null)
  }

  return (
    <div className={playerView ? 'player-frame' : 'coach-frame'}>
      {playerView ? null : (
        <nav className="side-nav" aria-label="Coach">
          {TABS.map((tab) => (
            <Link key={tab} to="/team">
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
          <h1>Team</h1>
          {headCoach ? (
            <button type="button" className="invite-button" onClick={() => setInviteOpen(true)}>
              + Invite
            </button>
          ) : null}
          <AccountMenu name={playerView ? 'Player' : (snap.session?.user.email ?? 'Coach Kim')} />
        </header>
        {playerView ? <p>Names and positions only.</p> : null}
        <div className="roster-filters" role="tablist">
          {(['All', 'Coaches', 'Players', 'Pending'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <table className="roster-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Position</th>
              <th className="col-status">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="status-dot" data-status={row.status} />
                  {row.name}
                </td>
                <td>{row.role}</td>
                <td>{row.position}</td>
                <td className="col-status">{row.status}</td>
                <td>
                  {headCoach ? (
                    <button
                      type="button"
                      className="more"
                      aria-label={`Actions for ${row.name}`}
                      onClick={() => setMenuId(row.id)}
                    >
                      ⋯
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="roster-cards">
          {shown.map((row) => (
            <li key={row.id}>
              <span className="status-dot" data-status={row.status} />
              <strong>{row.name}</strong>
              <span className="pos-badge">{row.position}</span>
              <span>{row.role}</span>
              {headCoach ? (
                <button
                  type="button"
                  className="more"
                  aria-label={`Actions for ${row.name}`}
                  onClick={() => setMenuId(row.id)}
                >
                  ⋯
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {notice ? <p className="auth-note">{notice}</p> : null}
      </div>
      {playerView ? null : (
        <nav className="tab-bar" aria-label="Coach">
          {TABS.map((tab) => (
            <Link key={tab} to="/team">
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
            <Link key={tab} to="/team" onClick={() => setMenuOpen(false)}>
              {tab}
            </Link>
          ))}
        </div>
      ) : null}
      {menuRow && headCoach ? (
        <div className="row-menu" role="menu">
          {menuRow.status === 'Pending' ? (
            <>
              <button type="button" onClick={() => void runAction('resend')}>
                Resend invite
              </button>
              <button type="button" onClick={() => void runAction('revoke')}>
                Revoke invite
              </button>
            </>
          ) : menuRow.status === 'Removed' ? (
            <button type="button" onClick={() => void runAction('delete')}>
              Delete player data
            </button>
          ) : (
            <>
              {menuRow.kind === 'player' ? (
                <label className="auth-field">
                  <span>Position</span>
                  <select
                    aria-label={`Position for ${menuRow.name}`}
                    value={
                      POSITIONS.includes(menuRow.position as PositionCode) ? menuRow.position : 'WR'
                    }
                    onChange={(event) => void runAction('position', event.target.value)}
                  >
                    {POSITIONS.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button type="button" onClick={() => void runAction('remove')}>
                Remove
              </button>
            </>
          )}
          <button type="button" onClick={() => setMenuId(null)}>
            Cancel
          </button>
        </div>
      ) : null}
      {inviteOpen ? (
        <form
          className="invite-sheet"
          onSubmit={(event) => {
            event.preventDefault()
            void sendInvite(new FormData(event.currentTarget))
          }}
        >
          <h2>Invite</h2>
          <label className="auth-field">
            <span>Name</span>
            <input name="name" required />
          </label>
          <label className="auth-field">
            <span>Email</span>
            <input name="email" type="email" required />
          </label>
          <label className="auth-field">
            <span>Role</span>
            <select
              name="role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
            >
              <option value="player">Player</option>
              <option value="coach">Coach</option>
              <option value="head_coach">Head coach</option>
            </select>
          </label>
          <label className="auth-field">
            <span>Position</span>
            <input name="position" />
          </label>
          <label className="auth-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I confirm this player&apos;s parent/guardian or school has consented to this account
            </span>
          </label>
          {inviteRole === 'player' && !consent ? <p>Confirm consent to invite a player</p> : null}
          <button
            className="auth-submit"
            type="submit"
            disabled={inviteRole === 'player' && !consent}
          >
            Send invite
          </button>
          <button
            type="button"
            className="auth-submit secondary"
            onClick={() => setInviteOpen(false)}
          >
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  )
}
