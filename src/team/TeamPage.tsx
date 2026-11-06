import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import type { PositionCode, TeamRole } from '../data/database.types'
import { supabase } from '../data/supabase'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemAvatar from '@mui/material/ListItemAvatar'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import { CoachLayout } from '../app/CoachLayout'

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

  const accountName = playerView ? 'Player' : (snap.session?.user.email ?? 'Coach Kim')
  const counts = {
    All: rows.length,
    Coaches: rows.filter((row) => row.kind === 'coach').length,
    Players: rows.filter((row) => row.kind === 'player').length,
    Pending: rows.filter((row) => row.status === 'Pending').length,
  }

  return (
    <CoachLayout
      title="Team"
      subtitle={playerView ? 'Names and positions only.' : `${counts.All} people on the roster`}
      account={accountName}
      nav={!playerView}
      actions={
        headCoach ? (
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => setInviteOpen(true)}
          >
            Invite
          </Button>
        ) : null
      }
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={filter}
        onChange={(_, value: typeof filter | null) => {
          if (value != null) setFilter(value)
        }}
        aria-label="Filter roster"
        sx={{ mb: 2, flexWrap: 'wrap' }}
      >
        {(['All', 'Coaches', 'Players', 'Pending'] as const).map((item) => (
          <ToggleButton key={item} value={item} aria-pressed={filter === item}>
            {item}
            <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontWeight: 500 }}>
              {counts[item]}
            </Box>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {notice ? (
        <Alert severity="info" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      ) : null}

      <Card>
        <TableContainer sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Position</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <PersonAvatar name={row.name} />
                      <Typography sx={{ fontWeight: 600 }}>{row.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>
                    <Chip size="small" label={row.position} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <StatusChip status={row.status} />
                  </TableCell>
                  <TableCell align="right">
                    {headCoach ? (
                      <IconButton
                        aria-label={`Actions for ${row.name}`}
                        onClick={() => setMenuId(row.id)}
                      >
                        <MoreHorizIcon />
                      </IconButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <List sx={{ display: { xs: 'block', sm: 'none' } }} disablePadding>
          {shown.map((row, index) => (
            <ListItem
              key={row.id}
              divider={index < shown.length - 1}
              secondaryAction={
                headCoach ? (
                  <IconButton
                    edge="end"
                    aria-label={`Actions for ${row.name}`}
                    onClick={() => setMenuId(row.id)}
                  >
                    <MoreHorizIcon />
                  </IconButton>
                ) : null
              }
            >
              <ListItemAvatar>
                <PersonAvatar name={row.name} />
              </ListItemAvatar>
              <ListItemText
                primary={row.name}
                secondary={
                  <Stack
                    component="span"
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'center', mt: 0.5 }}
                  >
                    <span>{row.role}</span>
                    <Chip component="span" size="small" label={row.position} variant="outlined" />
                    {row.status !== 'Active' ? <StatusChip status={row.status} /> : null}
                  </Stack>
                }
                slotProps={{
                  primary: { sx: { fontWeight: 600 } },
                  secondary: { component: 'div' },
                }}
              />
            </ListItem>
          ))}
        </List>
        {shown.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            Nobody here yet.
          </Typography>
        ) : null}
      </Card>

      <Dialog
        open={menuRow != null && headCoach}
        onClose={() => setMenuId(null)}
        fullWidth
        maxWidth="xs"
      >
        {menuRow != null ? (
          <>
            <DialogTitle>{menuRow.name}</DialogTitle>
            <DialogContent>
              <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                {menuRow.status === 'Pending' ? (
                  <>
                    <Button variant="outlined" onClick={() => void runAction('resend')}>
                      Resend invite
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => void runAction('revoke')}
                    >
                      Revoke invite
                    </Button>
                  </>
                ) : menuRow.status === 'Removed' ? (
                  <Button variant="outlined" color="error" onClick={() => void runAction('delete')}>
                    Delete player data
                  </Button>
                ) : (
                  <>
                    {menuRow.kind === 'player' ? (
                      <TextField
                        select
                        label="Position"
                        value={
                          POSITIONS.includes(menuRow.position as PositionCode)
                            ? menuRow.position
                            : 'WR'
                        }
                        onChange={(event) => void runAction('position', event.target.value)}
                        slotProps={{ htmlInput: { 'aria-label': `Position for ${menuRow.name}` } }}
                      >
                        {POSITIONS.map((code) => (
                          <MenuItem key={code} value={code}>
                            {code}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : null}
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => void runAction('remove')}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMenuId(null)}>Cancel</Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} fullWidth maxWidth="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void sendInvite(new FormData(event.currentTarget))
          }}
        >
          <DialogTitle>Invite</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField name="name" label="Name" required />
              <TextField name="email" label="Email" type="email" required />
              <TextField
                name="role"
                label="Role"
                select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
              >
                <MenuItem value="player">Player</MenuItem>
                <MenuItem value="coach">Coach</MenuItem>
                <MenuItem value="head_coach">Head coach</MenuItem>
              </TextField>
              <TextField name="position" label="Position" />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                }
                label="I confirm this player's parent/guardian or school has consented to this account"
              />
              {inviteRole === 'player' && !consent ? (
                <Alert severity="warning">Confirm consent to invite a player</Alert>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={inviteRole === 'player' && !consent}
            >
              Send invite
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </CoachLayout>
  )
}

function PersonAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <Avatar
      sx={{
        width: 36,
        height: 36,
        fontSize: 14,
        bgcolor: 'rgba(255,255,255,0.1)',
        color: 'text.primary',
      }}
    >
      {initials}
    </Avatar>
  )
}

function StatusChip({ status }: { status: Row['status'] }) {
  const color = status === 'Active' ? 'success' : status === 'Pending' ? 'warning' : 'default'
  return <Chip component="span" size="small" label={status} color={color} variant="outlined" />
}
