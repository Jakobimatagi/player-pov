import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { App } from '../App'
import {
  destination,
  getAuthSnap,
  HAD_TEAM_KEY,
  noteActivity,
  reloadMembership,
  safeNext,
  startAuth,
  subscribeAuth,
} from '../auth/session'
import { supabase } from '../data/supabase'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { CoachHome } from './CoachHome'
import { CoachLayout } from './CoachLayout'

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
  useEffect(() => {
    void reloadMembership()
  }, [location.pathname])
  if (snap.expired && location.pathname !== '/login') {
    return <Navigate to="/login?expired=1" replace />
  }
  return <Outlet />
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  const snap = useAuth()
  const name = snap.session?.user.email ?? 'Account'
  return (
    <CoachLayout title={title} account={name} nav={false}>
      {children}
    </CoachLayout>
  )
}

function Loading() {
  return (
    <Stack sx={{ minHeight: '60vh', placeItems: 'center' }}>
      <Stack spacing={2} sx={{ alignItems: 'center', m: 'auto' }}>
        <CircularProgress />
        <Typography color="text.secondary">Loading…</Typography>
      </Stack>
    </Stack>
  )
}

export function HomePage() {
  const snap = useAuth()
  const lostAccess =
    snap.session != null && localStorage.getItem(HAD_TEAM_KEY) === snap.session.user.id
  const kind = destination({
    backend: supabase != null,
    ready: snap.ready,
    hasSession: snap.session != null,
    role: snap.role,
    membershipLoaded: snap.membershipLoaded,
    membershipError: snap.membershipError,
    lostAccess,
  })
  if (kind === 'viewer') return <App />
  if (kind === 'loading') return <Loading />
  if (kind === 'login') return <Navigate to={`/login?next=${encodeURIComponent('/')}`} replace />
  if (kind === 'error') {
    return (
      <Shell title="Team">
        <Alert severity="error">Couldn&apos;t load your team.</Alert>
      </Shell>
    )
  }
  if (kind === 'removed') {
    return (
      <Shell title="Team">
        <Alert severity="warning">You no longer have access to this team</Alert>
      </Shell>
    )
  }
  if (kind === 'player') {
    return (
      <Shell title="Player Home">
        <Card>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h3">Nothing assigned yet</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Check with your coach.
            </Typography>
          </CardContent>
        </Card>
      </Shell>
    )
  }
  if (kind === 'staff') {
    return <CoachHome name={snap.session?.user.email ?? 'Account'} />
  }
  return <CreateTeamPage />
}

export function CreateTeamPage() {
  const [note, setNote] = useState<string | null>(null)
  const navigate = useNavigate()

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (supabase == null) return
    const form = new FormData(event.currentTarget)
    const { error } = await supabase.rpc('create_team', {
      p_name: String(form.get('name') ?? ''),
      p_school: String(form.get('school') ?? ''),
      p_season: String(form.get('season') ?? ''),
      p_hash_rule: String(form.get('hash') ?? 'NFHS'),
      p_season_ends_on: String(form.get('ends') ?? '2026-11-30'),
    })
    if (error) {
      setNote(error.message)
      return
    }
    await reloadMembership()
    navigate('/team')
  }

  return (
    <Shell title="Create team">
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Setting up as a coach? Create your team. Players: ask your coach for an invite.
      </Typography>
      <Card sx={{ maxWidth: 560 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
            <TextField name="name" label="Team name" required />
            <TextField name="school" label="School" />
            <TextField name="season" label="Season" placeholder="2026" />
            <TextField name="hash" label="Hash rule" select defaultValue="NFHS">
              <MenuItem value="NFHS">NFHS (high school)</MenuItem>
              <MenuItem value="NCAA">NCAA (college)</MenuItem>
            </TextField>
            <TextField
              name="ends"
              label="Season ends"
              type="date"
              defaultValue="2026-11-30"
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {note ? <Alert severity="error">{note}</Alert> : null}
            <Button type="submit" variant="contained" size="large">
              Create team
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Shell>
  )
}

export function WatchPage() {
  const snap = useAuth()
  const location = useLocation()
  const lostAccess =
    snap.session != null && localStorage.getItem(HAD_TEAM_KEY) === snap.session.user.id
  const kind = destination({
    backend: supabase != null,
    ready: snap.ready,
    hasSession: snap.session != null,
    role: snap.role,
    membershipLoaded: true,
    membershipError: false,
    lostAccess,
  })
  if (kind === 'loading') return <Loading />
  if (kind === 'removed') {
    return (
      <Shell title="Team">
        <Alert severity="warning">You no longer have access to this team</Alert>
      </Shell>
    )
  }
  if (kind === 'login') {
    const next = safeNext(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <App />
}
