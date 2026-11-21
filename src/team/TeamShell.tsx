import type { ReactNode } from 'react'
import { Link, NavLink, Navigate } from 'react-router'
import { AccountMenu } from '../app/AccountMenu'
import type { AuthSnap } from '../auth/session'

const TEAM_TABS = [
  { to: '/team', label: 'Members', end: true },
  { to: '/team/roster', label: 'Roster sheet', end: false },
  { to: '/team/depth', label: 'Depth chart', end: false },
] as const

/** Team sub-pages: Members, Roster sheet, Depth chart. */
export function TeamTabs() {
  return (
    <nav className="team-tabs" aria-label="Team">
      {TEAM_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Coach frame for the roster sheet and depth chart. Players are sent back to /team. */
export function TeamShell({
  title,
  snap,
  demo,
  children,
  wide = false,
}: {
  title: string
  snap: AuthSnap
  demo: boolean
  children: ReactNode
  wide?: boolean
}) {
  if (!demo && snap.ready && snap.session == null) {
    return <Navigate to="/login?next=/team" replace />
  }
  if (!demo && snap.membershipLoaded && snap.role === 'player') {
    return <Navigate to="/team" replace />
  }
  return (
    <div className="coach-frame">
      <nav className="side-nav" aria-label="Coach">
        <Link to="/">Home</Link>
        <Link to="/team">Team</Link>
        <Link to="/playbook">Playbooks</Link>
      </nav>
      <div className={wide ? 'coach-main coach-main-wide' : 'coach-main'}>
        <header className="roster-head">
          <h1>{title}</h1>
          <AccountMenu name={snap.session?.user.email ?? 'Coach'} />
        </header>
        <TeamTabs />
        {children}
      </div>
      <nav className="tab-bar" aria-label="Coach">
        <Link to="/">Home</Link>
        <Link to="/team">Team</Link>
        <Link to="/playbook">Playbooks</Link>
      </nav>
    </div>
  )
}
