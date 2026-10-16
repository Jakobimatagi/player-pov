import { useEffect, useState, type FormEvent } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { supabase } from '../data/supabase'
import { AuthField, AuthScreen } from './AuthScreen'
import {
  asAuthFlowClient,
  inviteRedirect,
  forgetInviteToken,
  inviteTokenFromState,
  loginLocation,
  rememberedInviteToken,
  rememberInviteToken,
  settleInviteToken,
  resendSignup,
  signedInAs,
  stripInviteToken,
  SWITCH_ACCOUNT,
  WRONG_ACCOUNT,
  submitAcceptInvite,
  submitForgot,
  submitInviteSignup,
  submitLogin,
  submitReset,
  submitSignup,
} from './flows'
import {
  CONFIRM_EMAIL,
  FORGOT_SENT,
  getAuthSnap,
  INVITE_INVALID,
  linkExpired,
  MEMBERSHIP_TIMEOUT,
  passwordIssue,
  reloadMembership,
  RESET_EXPIRED,
  safeNext,
  SESSION_EXPIRED,
  signOut,
  SIGNED_OUT,
  subscribeAuth,
  waitForMembership,
} from './session'

function originRedirect(path: string): string {
  return `${window.location.origin}${path}`
}

export function LoginPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const next = safeNext(params.get('next'))
  const inviteToken = inviteTokenFromState(location.state)
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
    try {
      const result = await submitLogin(asAuthFlowClient(supabase), email, password)
      if (!result.ok) {
        setError(result.message)
        return
      }
      await waitForMembership()
      if (inviteToken != null) {
        rememberInviteToken(window.sessionStorage, inviteToken)
        navigate('/accept-invite', { replace: true })
        return
      }
      navigate(next, { replace: true })
    } catch {
      setError(MEMBERSHIP_TIMEOUT)
    } finally {
      setPending(false)
    }
  }

  async function resend() {
    if (supabase == null || email === '') return
    await resendSignup(asAuthFlowClient(supabase), email)
  }

  return (
    <AuthScreen banner={banner ?? undefined} hint="Players need an invite from their coach.">
      <form onSubmit={onSubmit}>
        <h1>Log in</h1>
        {signedOut ? <p className="auth-note">{SIGNED_OUT}</p> : null}
        <AuthField label="Email">
          <input
            type="email"
            autoComplete="username"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </AuthField>
        <AuthField label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </AuthField>
        {error ? (
          <p className="auth-error" role="alert">
            {error}{' '}
            {error === CONFIRM_EMAIL ? (
              <button type="button" className="auth-textlink" onClick={() => void resend()}>
                Resend confirmation
              </button>
            ) : null}
          </p>
        ) : null}
        <button className="auth-submit" type="submit" disabled={pending}>
          Log in
        </button>
        <Link className="auth-textlink" to="/forgot-password">
          Forgot password?
        </Link>
        <Link className="auth-textlink" to="/signup">
          Create a coach account
        </Link>
      </form>
    </AuthScreen>
  )
}

export function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    try {
      const result = await submitSignup(asAuthFlowClient(supabase), {
        email,
        password,
        confirm: password,
        redirectTo: originRedirect('/'),
        data: { display_name: name },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.needsConfirm) setSent(true)
    } finally {
      setPending(false)
    }
  }

  async function resend() {
    if (supabase == null) return
    await resendSignup(asAuthFlowClient(supabase), email)
  }

  return (
    <AuthScreen hint="Players need an invite from their coach.">
      {sent ? (
        <div>
          <h1>Confirm your email</h1>
          <p className="auth-note">{CONFIRM_EMAIL}</p>
          <button type="button" className="auth-submit" onClick={() => void resend()}>
            Resend confirmation
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <h1>Create account</h1>
          <AuthField label="Name">
            <input value={name} required onChange={(event) => setName(event.target.value)} />
          </AuthField>
          <AuthField label="Email">
            <input
              type="email"
              autoComplete="username"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </AuthField>
          <AuthField label="Password">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </AuthField>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="auth-submit" type="submit" disabled={pending}>
            Create account
          </button>
          <Link className="auth-textlink" to="/login">
            Log in
          </Link>
        </form>
      )}
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
    try {
      if (supabase != null) {
        await submitForgot(asAuthFlowClient(supabase), email, originRedirect('/reset-password'))
      }
    } finally {
      setPending(false)
      setSent(true)
    }
  }

  return (
    <AuthScreen>
      {sent ? (
        <p className="auth-note" role="status">
          {FORGOT_SENT}
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <h1>Forgot password</h1>
          <AuthField label="Email">
            <input
              type="email"
              autoComplete="username"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </AuthField>
          <button className="auth-submit" type="submit" disabled={pending}>
            Send link
          </button>
          <Link className="auth-textlink" to="/login">
            Log in
          </Link>
        </form>
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
    const result = await submitReset(asAuthFlowClient(supabase), password, confirm)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setDone(true)
  }

  if (expired) {
    return (
      <AuthScreen>
        <h1>Reset password</h1>
        <p className="auth-error" role="alert">
          {RESET_EXPIRED}
        </p>
        <Link className="auth-submit auth-submit-link" to="/forgot-password">
          Send a new one
        </Link>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen>
      {done ? (
        <p className="auth-note">Password updated. You can log in.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <h1>Reset password</h1>
          <div className="auth-pair">
            <AuthField label="New password">
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </AuthField>
            <AuthField label="Confirm password">
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                required
                onChange={(event) => setConfirm(event.target.value)}
              />
            </AuthField>
          </div>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="auth-submit" type="submit">
            Save password
          </button>
        </form>
      )}
    </AuthScreen>
  )
}

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const [token] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    if (linkExpired(window.location.search, window.location.hash)) {
      forgetInviteToken(window.sessionStorage)
      return null
    }
    const fromUrl = stripInviteToken(window.location.search).token
    if (fromUrl != null) {
      rememberInviteToken(window.sessionStorage, fromUrl)
      return fromUrl
    }
    return rememberedInviteToken(window.sessionStorage)
  })
  const invalid = token == null || linkExpired(window.location.search, window.location.hash)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wrongAccount, setWrongAccount] = useState(false)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const signedIn = snap.session != null

  useEffect(() => {
    const expired = linkExpired(window.location.search, window.location.hash)
    const stripped = stripInviteToken(window.location.search)
    if (expired || stripped.token == null) {
      if (expired) forgetInviteToken(window.sessionStorage)
    } else {
      rememberInviteToken(window.sessionStorage, stripped.token)
    }
    if (stripped.token == null) return
    const next = `${window.location.pathname}${stripped.search}${window.location.hash}`
    window.history.replaceState(window.history.state, '', next)
  }, [])

  useEffect(() => {
    if (!invalid) return
    forgetInviteToken(window.sessionStorage)
  }, [invalid])

  useEffect(() => {
    if (invalid || token == null || supabase == null || !snap.ready || !signedIn) return
    let cancelled = false
    void submitAcceptInvite(asAuthFlowClient(supabase), token).then(async (result) => {
      if (cancelled) return
      settleInviteToken(window.sessionStorage, result)
      if (result.ok) {
        await reloadMembership()
        if (cancelled) return
        navigate('/', { replace: true })
        return
      }
      if (result.reason === 'wrong-account') {
        setWrongAccount(true)
        setError(null)
        return
      }
      setWrongAccount(false)
      setError(result.message)
    })
    return () => {
      cancelled = true
    }
  }, [attempt, invalid, navigate, signedIn, snap.ready, token])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const issue = passwordIssue(password, confirm)
    if (issue) {
      setError(issue)
      return
    }
    if (supabase == null || token == null) {
      setError('This preview has no account server yet.')
      return
    }
    setPending(true)
    try {
      const result = await submitInviteSignup(asAuthFlowClient(supabase), {
        email,
        password,
        confirm,
        token,
        origin: window.location.origin,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.needsConfirm) setSent(true)
    } finally {
      setPending(false)
    }
  }

  async function resend() {
    if (supabase == null || token == null || email === '') return
    await resendSignup(
      asAuthFlowClient(supabase),
      email,
      inviteRedirect(window.location.origin, token),
    )
  }

  if (invalid) {
    return (
      <AuthScreen>
        <h1>Accept invite</h1>
        <p className="auth-error" role="alert">
          {INVITE_INVALID}
        </p>
        <Link className="auth-textlink" to="/login">
          Log in
        </Link>
      </AuthScreen>
    )
  }

  const loginTo = loginLocation(token)

  if (supabase != null && !snap.ready) {
    return (
      <AuthScreen banner="You're invited">
        <h1>Accept invite</h1>
        <p className="auth-note" role="status">
          Loading…
        </p>
      </AuthScreen>
    )
  }

  async function switchAccount() {
    await signOut('local')
    setWrongAccount(false)
    setError(null)
  }

  if (snap.session != null) {
    const signedInEmail = snap.session.user.email ?? 'this account'
    return (
      <AuthScreen banner="You're invited">
        <h1>Accept invite</h1>
        {wrongAccount ? (
          <>
            <p className="auth-note">{signedInAs(signedInEmail)}</p>
            <p className="auth-error" role="alert">
              {WRONG_ACCOUNT}
            </p>
            <button type="button" className="auth-submit" onClick={() => void switchAccount()}>
              {SWITCH_ACCOUNT}
            </button>
          </>
        ) : error ? (
          <>
            <p className="auth-error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="auth-submit"
              onClick={() => {
                setError(null)
                setAttempt((value) => value + 1)
              }}
            >
              Try again
            </button>
          </>
        ) : (
          <p className="auth-note" role="status">
            Joining the team…
          </p>
        )}
      </AuthScreen>
    )
  }

  return (
    <AuthScreen banner="You're invited">
      {sent ? (
        <div>
          <h1>Confirm your email</h1>
          <p className="auth-note" role="status">
            {CONFIRM_EMAIL}
          </p>
          <button type="button" className="auth-submit" onClick={() => void resend()}>
            Resend confirmation
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <h1>Create account</h1>
          <AuthField label="Email">
            <input
              type="email"
              autoComplete="username"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </AuthField>
          <div className="auth-pair">
            <AuthField label="Password">
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </AuthField>
            <AuthField label="Confirm password">
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                required
                onChange={(event) => setConfirm(event.target.value)}
              />
            </AuthField>
          </div>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="auth-submit" type="submit" disabled={pending}>
            Create account
          </button>
          <Link className="auth-textlink" to={loginTo.pathname} state={loginTo.state}>
            Log in
          </Link>
        </form>
      )}
    </AuthScreen>
  )
}
