import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAcceptInflight,
  inviteRedirect,
  acceptFailure,
  INVITE_TOKEN_KEY,
  inviteTokenFromState,
  loginLocation,
  mapAcceptError,
  rememberedInviteToken,
  rememberInviteToken,
  signedInAs,
  stripInviteToken,
  SWITCH_ACCOUNT,
  WRONG_ACCOUNT,
  parseInviteToken,
  submitAcceptInvite,
  submitForgot,
  submitInviteSignup,
  submitLogin,
  submitReset,
  submitSignup,
  type AuthFlowClient,
} from '../src/auth/flows'
import { CONFIRM_EMAIL, INVITE_INVALID, LOGIN_ERROR, RESET_EXPIRED } from '../src/auth/session'

const TOKEN = 'ab'.repeat(32)

function client(partial: {
  auth?: Partial<AuthFlowClient['auth']>
  rpc?: AuthFlowClient['rpc']
  from?: ReturnType<typeof vi.fn>
}): AuthFlowClient & { from: ReturnType<typeof vi.fn> } {
  return {
    from:
      partial.from ??
      vi.fn(() => {
        throw new Error('anon must not read tables')
      }),
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      resend: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      ...partial.auth,
    },
    rpc: partial.rpc ?? vi.fn(async () => ({ data: null, error: null })),
  }
}

describe('invite token', () => {
  it('accepts 64 hex characters and rejects everything else', () => {
    expect(parseInviteToken(TOKEN)).toBe(TOKEN)
    expect(parseInviteToken(`  ${TOKEN.toUpperCase()}  `)).toBe(TOKEN.toUpperCase())
    expect(parseInviteToken(TOKEN.slice(0, 63))).toBeNull()
    expect(parseInviteToken(`${TOKEN}a`)).toBeNull()
    expect(parseInviteToken('g'.repeat(64))).toBeNull()
    expect(parseInviteToken(null)).toBeNull()
    expect(parseInviteToken('')).toBeNull()
  })

  it('keeps the token on the confirmation redirect', () => {
    expect(inviteRedirect('http://127.0.0.1:5173', TOKEN)).toBe(
      `http://127.0.0.1:5173/accept-invite?token=${TOKEN}`,
    )
  })
})

describe('accept invite', () => {
  beforeEach(() => {
    clearAcceptInflight()
  })

  it('maps server failures onto the invite and confirmation copy', () => {
    expect(mapAcceptError({ message: 'invite email does not match' })).toBe(WRONG_ACCOUNT)
    expect(acceptFailure({ message: 'invite email does not match' }).reason).toBe('wrong-account')
    expect(mapAcceptError({ message: 'invite expired' })).toBe(INVITE_INVALID)
    expect(mapAcceptError({ message: 'invite already accepted' })).toBe(INVITE_INVALID)
    expect(mapAcceptError({ message: 'email is not confirmed' })).toBe(CONFIRM_EMAIL)
    expect(mapAcceptError({ message: 'invite not found' })).toBe(INVITE_INVALID)
    expect(mapAcceptError(null)).toBe(INVITE_INVALID)
  })

  it('calls accept_invite and does not read a table', async () => {
    const rpc = vi.fn(async () => ({ data: 'user-id', error: null }))
    const flow = client({ rpc })
    const result = await submitAcceptInvite(flow, TOKEN)
    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('accept_invite', { token: TOKEN })
    expect(flow.from).not.toHaveBeenCalled()
  })

  it('shares one request for the same token and allows a retry after failure', async () => {
    const rpc = vi
      .fn<() => Promise<{ data: string | null; error: { message: string } | null }>>()
      .mockResolvedValueOnce({ data: null, error: { message: 'invite expired' } })
      .mockResolvedValueOnce({ data: 'user-id', error: null })
    const flow = client({ rpc })
    const [first, second] = await Promise.all([
      submitAcceptInvite(flow, TOKEN),
      submitAcceptInvite(flow, TOKEN),
    ])
    expect(first).toEqual({ ok: false, message: INVITE_INVALID, reason: 'invalid' })
    expect(second).toEqual(first)
    expect(rpc).toHaveBeenCalledTimes(1)
    const retry = await submitAcceptInvite(flow, TOKEN)
    expect(retry).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(flow.from).not.toHaveBeenCalled()
  })

  it('rejects a token that is not 64 hex characters', async () => {
    const flow = client({})
    const result = await submitAcceptInvite(flow, 'nope')
    expect(result).toEqual({ ok: false, message: INVITE_INVALID, reason: 'invalid' })
    expect(flow.rpc).not.toHaveBeenCalled()
  })
})

describe('invite token handling', () => {
  it('strips the token from the query and keeps it in storage and login state', () => {
    const storage = new Map<string, string>()
    const memory = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }
    const stripped = stripInviteToken(`?token=${TOKEN}&expired=1`)
    expect(stripped.token).toBe(TOKEN)
    expect(stripped.search).toBe('?expired=1')
    expect(stripInviteToken('').token).toBeNull()
    rememberInviteToken(memory, TOKEN)
    expect(storage.get(INVITE_TOKEN_KEY)).toBe(TOKEN)
    expect(rememberedInviteToken(memory)).toBe(TOKEN)
    const login = loginLocation(TOKEN)
    expect(login.pathname).toBe('/login')
    expect(login.state).toEqual({ inviteToken: TOKEN })
    expect(JSON.stringify(login)).not.toContain('next=')
    expect(inviteTokenFromState(login.state)).toBe(TOKEN)
    expect(inviteTokenFromState(null)).toBeNull()
  })

  it('keeps the stashed token when the signed-in email does not match', async () => {
    clearAcceptInflight()
    const storage = new Map<string, string>()
    const memory = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }
    rememberInviteToken(memory, TOKEN)
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'invite email does not match' },
    }))
    const flow = client({ rpc })
    const result = await submitAcceptInvite(flow, TOKEN)
    expect(result).toEqual({ ok: false, message: WRONG_ACCOUNT, reason: 'wrong-account' })
    expect(rememberedInviteToken(memory)).toBe(TOKEN)
    expect(signedInAs('player@demo.local')).toBe("You're signed in as player@demo.local.")
    expect(SWITCH_ACCOUNT).toBe('Sign out and switch')
    expect(flow.from).not.toHaveBeenCalled()
  })
})

describe('auth flows', () => {
  it('signs in through the auth client', async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: 'invalid_credentials', message: 'Invalid login' } })
      .mockResolvedValueOnce({ error: { code: 'email_not_confirmed', message: 'no' } })
      .mockResolvedValueOnce({ error: null })
    const flow = client({ auth: { signInWithPassword } })
    expect(await submitLogin(flow, 'player@demo.local', 'nope')).toEqual({
      ok: false,
      message: LOGIN_ERROR,
    })
    expect(await submitLogin(flow, 'player@demo.local', 'password1234')).toEqual({
      ok: false,
      message: CONFIRM_EMAIL,
    })
    expect(await submitLogin(flow, 'player@demo.local', 'password1234')).toEqual({ ok: true })
    expect(flow.from).not.toHaveBeenCalled()
  })

  it('signs a coach up and reports when confirmation is still required', async () => {
    const signUp = vi.fn(async () => ({ data: { session: null }, error: null }))
    const flow = client({ auth: { signUp } })
    const short = await submitSignup(flow, {
      email: 'coach@demo.local',
      password: 'short',
      confirm: 'short',
      redirectTo: 'http://127.0.0.1:5173/',
    })
    expect(short).toEqual({ ok: false, message: 'Use at least 10 characters' })
    expect(signUp).not.toHaveBeenCalled()
    const sent = await submitSignup(flow, {
      email: 'coach@demo.local',
      password: 'password1234',
      confirm: 'password1234',
      redirectTo: 'http://127.0.0.1:5173/',
      data: { display_name: 'Coach Kim' },
    })
    expect(sent).toEqual({ ok: true, needsConfirm: true })
    expect(signUp).toHaveBeenCalledWith({
      email: 'coach@demo.local',
      password: 'password1234',
      options: {
        emailRedirectTo: 'http://127.0.0.1:5173/',
        data: { display_name: 'Coach Kim' },
      },
    })
    expect(readFileSync(new URL('../src/auth/pages.tsx', import.meta.url), 'utf8')).not.toMatch(
      /data:\s*\{[^}]*\bcoach\b/,
    )
  })

  it('sends the invite token on the signup redirect and does not read a table', async () => {
    const signUp = vi.fn(async () => ({ data: { session: { user: {} } }, error: null }))
    const flow = client({ auth: { signUp } })
    const result = await submitInviteSignup(flow, {
      email: 'player@demo.local',
      password: 'password1234',
      confirm: 'password1234',
      token: TOKEN,
      origin: 'http://127.0.0.1:5173',
    })
    expect(result).toEqual({ ok: true, needsConfirm: false })
    expect(signUp).toHaveBeenCalledWith({
      email: 'player@demo.local',
      password: 'password1234',
      options: {
        emailRedirectTo: `http://127.0.0.1:5173/accept-invite?token=${TOKEN}`,
      },
    })
    expect(flow.from).not.toHaveBeenCalled()
    expect(flow.rpc).not.toHaveBeenCalled()
  })

  it('points an existing account at login', async () => {
    const signUp = vi.fn(async () => ({
      data: { session: null },
      error: { message: 'User already registered' },
    }))
    const flow = client({ auth: { signUp } })
    const result = await submitInviteSignup(flow, {
      email: 'player@demo.local',
      password: 'password1234',
      confirm: 'password1234',
      token: TOKEN,
      origin: 'http://127.0.0.1:5173',
    })
    expect(result).toEqual({
      ok: false,
      message: 'Log in with that email to accept the invite.',
    })
  })

  it('shows the same forgot-password result when the request fails', async () => {
    const resetPasswordForEmail = vi.fn(async () => {
      throw new Error('network')
    })
    const flow = client({ auth: { resetPasswordForEmail } })
    expect(
      await submitForgot(flow, 'nobody@demo.local', 'http://127.0.0.1:5173/reset-password'),
    ).toEqual({ ok: true })
    expect(resetPasswordForEmail).toHaveBeenCalledWith('nobody@demo.local', {
      redirectTo: 'http://127.0.0.1:5173/reset-password',
    })
  })

  it('maps a failed password update to the expired-link copy', async () => {
    const updateUser = vi.fn(async () => ({ error: { message: 'otp expired' } }))
    const flow = client({ auth: { updateUser } })
    expect(await submitReset(flow, 'short', 'short')).toEqual({
      ok: false,
      message: 'Use at least 10 characters',
    })
    expect(updateUser).not.toHaveBeenCalled()
    expect(await submitReset(flow, 'password1234', 'password1234')).toEqual({
      ok: false,
      message: RESET_EXPIRED,
    })
  })
})
