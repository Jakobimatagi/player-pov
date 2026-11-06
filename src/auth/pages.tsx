import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { supabase } from '../data/supabase'
import { AuthLink, AuthScreen } from './AuthScreen'
import {
  CONFIRM_EMAIL,
  FORGOT_SENT,
  INVITE_INVALID,
  linkExpired,
  mapLoginError,
  passwordIssue,
  reloadMembership,
  RESET_EXPIRED,
  safeNext,
  SESSION_EXPIRED,
  SIGNED_OUT,
} from './session'

function originRedirect(path: string): string {
  return `${window.location.origin}${path}`
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <Alert severity="error" role="alert">
      {children}
    </Alert>
  )
}

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const next = safeNext(params.get('next'))
  const banner = params.get('expired') === '1' ? SESSION_EXPIRED : null
  const signedOut = params.get('signedout') === '1'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (supabase == null) {
      setError('This preview has no account server yet.')
      return
    }
    setPending(true)
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)
    if (signError) {
      setError(mapLoginError(signError))
      return
    }
    navigate(next, { replace: true })
  }

  async function resend() {
    if (supabase == null || email === '') return
    await supabase.auth.resend({ type: 'signup', email })
  }

  return (
    <AuthScreen
      title="Log in"
      banner={banner ?? undefined}
      hint="Players need an invite from their coach."
    >
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        {signedOut ? <Alert severity="success">{SIGNED_OUT}</Alert> : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          required
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          required
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? (
          <ErrorLine>
            {error}{' '}
            {error === CONFIRM_EMAIL ? (
              <Button size="small" color="inherit" onClick={() => void resend()}>
                Resend confirmation
              </Button>
            ) : null}
          </ErrorLine>
        ) : null}
        <Button type="submit" variant="contained" size="large" disabled={pending}>
          Log in
        </Button>
        <Stack direction="row" sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <AuthLink to="/forgot-password">Forgot password?</AuthLink>
          <AuthLink to="/signup">Create a coach account</AuthLink>
        </Stack>
      </Stack>
    </AuthScreen>
  )
}

export function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [coach, setCoach] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const issue = passwordIssue(password, password)
    if (issue) {
      setError(issue)
      return
    }
    if (supabase == null) {
      setError('This preview has no account server yet.')
      return
    }
    setPending(true)
    const { data, error: signError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: originRedirect('/'),
        data: { display_name: name, coach },
      },
    })
    setPending(false)
    if (signError) {
      setError(signError.message)
      return
    }
    if (data.session == null) setSent(true)
  }

  async function resend() {
    if (supabase == null) return
    await supabase.auth.resend({ type: 'signup', email })
  }

  if (sent) {
    return (
      <AuthScreen title="Confirm your email" hint="Players need an invite from their coach.">
        <Stack spacing={2.5}>
          <Typography color="text.secondary">{CONFIRM_EMAIL}</Typography>
          <Button variant="contained" size="large" onClick={() => void resend()}>
            Resend confirmation
          </Button>
        </Stack>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen title="Create account" hint="Players need an invite from their coach.">
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        <TextField
          label="Name"
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          required
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          required
          onChange={(event) => setPassword(event.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox checked={coach} onChange={(event) => setCoach(event.target.checked)} />
          }
          label="I'm a coach creating a team"
        />
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        <Button type="submit" variant="contained" size="large" disabled={pending}>
          Create account
        </Button>
        <Typography variant="body2" color="text.secondary">
          Already have an account? <AuthLink to="/login">Log in</AuthLink>
        </Typography>
      </Stack>
    </AuthScreen>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    if (supabase != null) {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: originRedirect('/reset-password'),
      })
    }
    setPending(false)
    setSent(true)
  }

  return (
    <AuthScreen title="Forgot password">
      {sent ? (
        <Alert severity="success" role="status">
          {FORGOT_SENT}
        </Alert>
      ) : (
        <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" variant="contained" size="large" disabled={pending}>
            Send link
          </Button>
          <AuthLink to="/login">Log in</AuthLink>
        </Stack>
      )}
    </AuthScreen>
  )
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const expired = linkExpired(window.location.search, window.location.hash)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const issue = passwordIssue(password, confirm)
    if (issue) {
      setError(issue)
      return
    }
    if (supabase == null) {
      setError('This preview has no account server yet.')
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(RESET_EXPIRED)
      return
    }
    setDone(true)
  }

  if (expired) {
    return (
      <AuthScreen title="Reset password">
        <Stack spacing={2.5}>
          <ErrorLine>{RESET_EXPIRED}</ErrorLine>
          <Button component={Link} to="/forgot-password" variant="contained" size="large">
            Send a new one
          </Button>
        </Stack>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen title="Reset password">
      {done ? (
        <Alert severity="success">Password updated. You can log in.</Alert>
      ) : (
        <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            required
            onChange={(event) => setConfirm(event.target.value)}
          />
          {error ? <ErrorLine>{error}</ErrorLine> : null}
          <Button type="submit" variant="contained" size="large">
            Save password
          </Button>
        </Stack>
      )}
    </AuthScreen>
  )
}

export function AcceptInvitePage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const invalid = linkExpired(window.location.search, window.location.hash)
  const email = 'invited player'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const issue = passwordIssue(password, confirm)
    if (issue) {
      setError(issue)
      return
    }
    if (supabase == null) {
      setError('This preview has no account server yet.')
      return
    }
    const { data, error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(INVITE_INVALID)
      return
    }
    const inviteId = params.get('invite') ?? data.user?.user_metadata?.['invite_id']
    if (typeof inviteId === 'string' && inviteId !== '') {
      const { data: status } = await supabase.rpc('invite_status', { p_invite: inviteId })
      if (status === 'invalid') {
        setError(INVITE_INVALID)
        return
      }
      const { error: acceptError } = await supabase.rpc('accept_invite', { p_invite_id: inviteId })
      if (acceptError) {
        setError(
          acceptError.message.includes('no longer valid') ? INVITE_INVALID : acceptError.message,
        )
        return
      }
    }
    await reloadMembership()
    setDone(true)
    navigate('/')
  }

  if (invalid) {
    return (
      <AuthScreen title="Accept invite">
        <Stack spacing={2.5}>
          <ErrorLine>{INVITE_INVALID}</ErrorLine>
          <AuthLink to="/login">Log in</AuthLink>
        </Stack>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen title="Create account" banner="You're invited">
      {done ? (
        <Alert severity="success">Account ready.</Alert>
      ) : (
        <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
          <TextField label="Account" value={email} disabled />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            required
            onChange={(event) => setConfirm(event.target.value)}
          />
          {error ? <ErrorLine>{error}</ErrorLine> : null}
          <Button type="submit" variant="contained" size="large">
            Create account
          </Button>
        </Stack>
      )}
    </AuthScreen>
  )
}
