import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import { SIDE_LABEL, staffTitle } from '../auth/sides'
import type { PositionCode, PositionGroup, StaffSide, TeamRole } from '../data/database.types'
import { POSITION_GROUPS } from '../data/assignments'
import { setCoachGroups } from '../data/scoutTasks'
import { supabase } from '../data/supabase'
import { MoreHorizontal, UserPlus } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { initialsOf } from '@/lib/initials'
import { cn } from '@/lib/utils'
import { CoachLayout } from '../app/CoachLayout'
import { TeamTabs } from './TeamShell'
import './team.css'

type Row = {
  id: string
  name: string
  role: string
  roleCode: TeamRole
  position: string
  /** Coordinator side for staff. */
  side?: StaffSide | null
  /** Coach rooms (position groups) a coach runs. Scout pack sections can go to a room. */
  groups?: PositionGroup[]
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
    id: 'diaz',
    name: 'Coach Diaz',
    role: 'Defensive coordinator',
    roleCode: 'coach',
    position: '—',
    side: 'defense',
    groups: ['LB'],
    status: 'Active',
    kind: 'coach',
  },
  {
    id: 'reyes',
    name: 'Coach Reyes',
    role: 'Coach',
    roleCode: 'coach',
    position: '—',
    groups: ['DL'],
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

function roleLabel(role: TeamRole): string {
  if (role === 'player') return 'Player'
  if (role === 'coach') return 'Coach'
  return 'Head coach'
}

function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
}

/** The function's own `{ error }` text (a plan limit, a bad email), not the generic status. */
async function functionError(error: Error): Promise<string> {
  const context = (error as { context?: Response }).context
  const detail = context ? await context.json().catch(() => null) : null
  return (detail as { error?: string } | null)?.error ?? error.message
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
  const [menuId, setMenuId] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [inviteRole, setInviteRole] = useState('player')
  const [notice, setNotice] = useState<string | null>(null)
  const headCoach = !playerView && (fixture || snap.role === 'head_coach')

  useEffect(() => {
    startAuth()
  }, [])

  const sheetOpen = menuId != null || inviteOpen
  const closeSheets = () => {
    setMenuId(null)
    setInviteOpen(false)
  }
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuId(null)
        setInviteOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

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
        client.from('memberships').select('user_id, role, position, coordinates, coach_groups'),
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
        role: staffTitle(row.role, row.coordinates),
        roleCode: row.role,
        position: row.position ?? '—',
        side: row.coordinates,
        groups: row.coach_groups ?? [],
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
    setNotice(error ? await functionError(error) : 'Invite sent.')
    setInviteOpen(false)
  }

  async function toggleRoom(group: PositionGroup) {
    const row = menuRow
    if (row == null) return
    const current = row.groups ?? []
    const next = current.includes(group)
      ? current.filter((item) => item !== group)
      : POSITION_GROUPS.map((item) => item.id).filter((id) => id === group || current.includes(id))
    if (!(fixture || supabase == null || snap.teamId == null)) {
      try {
        await setCoachGroups(snap.teamId, row.id, next)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not change coach rooms.')
        return
      }
    }
    setRows((rows) => rows.map((item) => (item.id === row.id ? { ...item, groups: next } : item)))
    setNotice(
      next.length === 0 ? `${row.name} runs no room.` : `${row.name} runs ${next.join(', ')}.`,
    )
  }

  async function runAction(
    action: 'resend' | 'revoke' | 'remove' | 'delete' | 'position' | 'side',
    position?: string,
  ) {
    const row = menuRow
    if (row == null) return
    if (action === 'side') {
      const side: StaffSide | null =
        position === 'offense' || position === 'defense' || position === 'special' ? position : null
      const title = staffTitle(row.roleCode, side)
      if (!(fixture || supabase == null || snap.teamId == null)) {
        const { data, error } = await supabase
          .from('memberships')
          .update({ coordinates: side })
          .eq('team_id', snap.teamId)
          .eq('user_id', row.id)
          .select('user_id')
        if (error || data == null || data.length === 0) {
          setNotice(error?.message ?? 'Only the head coach can change coordinators.')
          setMenuId(null)
          return
        }
      }
      setRows((current) =>
        current.map((item) => (item.id === row.id ? { ...item, side, role: title } : item)),
      )
      setNotice(`${row.name} is now ${side == null ? 'a coach' : title.toLowerCase()}.`)
      setMenuId(null)
      return
    }
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
    setNotice(error ? await functionError(error) : 'Invite sent.')
    setMenuId(null)
  }

  const filterCounts = {
    All: rows.length,
    Coaches: rows.filter((row) => row.kind === 'coach').length,
    Players: rows.filter((row) => row.kind === 'player').length,
    Pending: rows.filter((row) => row.status === 'Pending').length,
  }

  return (
    <CoachLayout
      title="Team"
      eyebrow={playerView ? undefined : 'Team'}
      nav={!playerView}
      account={playerView ? 'Player' : (snap.session?.user.email ?? 'Coach Kim')}
      subnav={playerView ? undefined : <TeamTabs />}
      actions={
        headCoach ? (
          <Button size="lg" onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite
          </Button>
        ) : null
      }
    >
      {playerView ? (
        <p className="mb-4 text-sm text-muted-foreground">Names and positions only.</p>
      ) : null}
      <div
        className="mb-4 grid w-full grid-cols-4 gap-1 rounded-lg bg-muted p-1 sm:inline-flex sm:w-auto"
        role="tablist"
        aria-label="Filter members"
      >
        {(['All', 'Coaches', 'Players', 'Pending'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={cn(
              'inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm sm:px-3 font-medium text-muted-foreground transition-colors hover:text-foreground',
              filter === item && 'bg-background text-foreground shadow-sm',
            )}
          >
            {item}
            <span className="text-xs text-muted-foreground tabular-nums">{filterCounts[item]}</span>
          </button>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={row.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      {row.email ? (
                        <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.role}
                  {row.groups != null && row.groups.length > 0 ? ` · ${row.groups.join(', ')}` : ''}
                </TableCell>
                <TableCell>
                  {row.position === '—' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge variant="secondary">{row.position}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="pr-3 text-right">
                  {headCoach ? (
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Actions for ${row.name}`}
                      onClick={() => setMenuId(row.id)}
                    >
                      <MoreHorizontal />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {shown.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nobody here yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
        {shown.map((row) => (
          <li key={row.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <MemberAvatar name={row.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.role}
                {row.groups != null && row.groups.length > 0 ? ` · ${row.groups.join(', ')}` : ''}
              </p>
            </div>
            {row.position === '—' ? null : <Badge variant="secondary">{row.position}</Badge>}
            <StatusDot status={row.status} />
            {headCoach ? (
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11"
                aria-label={`Actions for ${row.name}`}
                onClick={() => setMenuId(row.id)}
              >
                <MoreHorizontal />
              </Button>
            ) : null}
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nobody here yet.</li>
        ) : null}
      </ul>
      {notice ? <p className="mt-4 text-sm text-muted-foreground">{notice}</p> : null}
      {(menuRow && headCoach) || inviteOpen ? (
        <div className="sheet-backdrop" aria-hidden="true" onClick={closeSheets} />
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
              ) : (
                <label className="auth-field">
                  <span>Coordinator</span>
                  <select
                    aria-label={`Coordinator side for ${menuRow.name}`}
                    value={menuRow.side ?? ''}
                    onChange={(event) => void runAction('side', event.target.value)}
                  >
                    <option value="">None</option>
                    <option value="offense">{SIDE_LABEL.offense} (OC)</option>
                    <option value="defense">{SIDE_LABEL.defense} (DC)</option>
                    <option value="special">{SIDE_LABEL.special} (STC)</option>
                  </select>
                </label>
              )}
              {menuRow.kind === 'coach' ? (
                <fieldset className="coach-rooms">
                  <legend>Coach rooms</legend>
                  <p>Scout pack sections can be delegated to a room.</p>
                  <div>
                    {POSITION_GROUPS.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        aria-pressed={(menuRow.groups ?? []).includes(group.id)}
                        aria-label={`${group.label} room for ${menuRow.name}`}
                        onClick={() => void toggleRoom(group.id)}
                      >
                        {group.id}
                      </button>
                    ))}
                  </div>
                </fieldset>
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
    </CoachLayout>
  )
}

function MemberAvatar({ name }: { name: string }) {
  return (
    <Avatar className="size-9">
      <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  )
}

const STATUS_TONE: Record<Row['status'], string> = {
  Active: 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25',
  Pending: 'bg-amber-500/12 text-amber-300 ring-amber-500/25',
  Removed: 'bg-red-500/12 text-red-300 ring-red-500/25',
}

function StatusBadge({ status }: { status: Row['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_TONE[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

function StatusDot({ status }: { status: Row['status'] }) {
  const tone =
    status === 'Active' ? 'bg-emerald-400' : status === 'Pending' ? 'bg-amber-400' : 'bg-red-400'
  return (
    <span className={cn('size-2 shrink-0 rounded-full', tone)} aria-label={status} role="img" />
  )
}
