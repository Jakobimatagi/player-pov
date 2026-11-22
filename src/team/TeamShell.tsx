import type { ReactNode } from 'react'
import { NavLink, Navigate } from 'react-router'
import { CoachLayout } from '../app/CoachLayout'
import type { AuthSnap } from '../auth/session'
import { cn } from '@/lib/utils'

const TEAM_TABS = [
  { to: '/team', label: 'Members', end: true },
  { to: '/team/roster', label: 'Roster sheet', end: false },
  { to: '/team/depth', label: 'Depth chart', end: false },
  { to: '/team/activity', label: 'Activity', end: false },
  { to: '/team/billing', label: 'Billing', end: false },
] as const

/** Team sub-pages: Members, Roster sheet, Depth chart, Activity, Billing. */
export function TeamTabs() {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Team">
      {TEAM_TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'inline-flex h-11 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
              isActive && 'border-primary text-foreground',
            )
          }
        >
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
    <CoachLayout
      title={title}
      eyebrow="Team"
      account={snap.session?.user.email ?? 'Coach'}
      wide={wide}
      subnav={<TeamTabs />}
    >
      {children}
    </CoachLayout>
  )
}
