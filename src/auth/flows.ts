import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../data/database.types'
import {
  CONFIRM_EMAIL,
  INVITE_INVALID,
  mapLoginError,
  passwordIssue,
  RESET_EXPIRED,
} from './session'

export type FlowError = { code?: string; message?: string }

export type AuthFlowClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string
      password: string
    }) => Promise<{ error: FlowError | null }>
    signUp: (credentials: {
      email: string
      password: string
      options?: {
        emailRedirectTo?: string
        data?: Record<string, unknown>
      }
    }) => Promise<{ data: { session: unknown }; error: FlowError | null }>
    resend: (args: {
      type: 'signup'
      email: string
      options?: { emailRedirectTo?: string }
    }) => Promise<{ error: FlowError | null }>
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string },
    ) => Promise<{ error: FlowError | null }>
    updateUser: (attributes: { password: string }) => Promise<{ error: FlowError | null }>
  }
  rpc: (
    fn: 'accept_invite',
    args: { token: string },
  ) => Promise<{ data: string | null; error: FlowError | null }>
}

export type FlowOk = { ok: true }
export type FlowFail = { ok: false; message: string }
export type SignupResult = { ok: true; needsConfirm: boolean } | FlowFail
export type AcceptReason = 'invalid' | 'unconfirmed' | 'wrong-account'
export type AcceptResult = { ok: true } | { ok: false; message: string; reason: AcceptReason }

export const INVITE_TOKEN_KEY = 'invite_token'
export const WRONG_ACCOUNT = 'This invite is for a different email.'
export const SWITCH_ACCOUNT = 'Sign out and switch'

const acceptInflight = new Map<string, Promise<AcceptResult>>()

/** Hex of 32 random bytes. Anything else is not an invite token. */
export function parseInviteToken(raw: string | null): string | null {
  if (raw == null) return null
  const token = raw.trim()
  if (!/^[0-9a-fA-F]{64}$/.test(token)) return null
  return token
}

export function inviteRedirect(origin: string, token: string): string {
  return `${origin}/accept-invite?token=${encodeURIComponent(token)}`
}

export function signedInAs(email: string): string {
  return `You're signed in as ${email}.`
}

export function acceptFailure(error: FlowError | null): {
  message: string
  reason: AcceptReason
} {
  const message = (error?.message ?? '').toLowerCase()
  if (message.includes('not confirmed')) return { message: CONFIRM_EMAIL, reason: 'unconfirmed' }
  if (message.includes('email does not match'))
    return { message: WRONG_ACCOUNT, reason: 'wrong-account' }
  return { message: INVITE_INVALID, reason: 'invalid' }
}

export function mapAcceptError(error: FlowError | null): string {
  return acceptFailure(error).message
}

export function stripInviteToken(search: string): { token: string | null; search: string } {
  const params = new URLSearchParams(search.replace(/^\?/, ''))
  const token = parseInviteToken(params.get('token'))
  params.delete('token')
  const rest = params.toString()
  return { token, search: rest === '' ? '' : `?${rest}` }
}

export function rememberInviteToken(storage: Pick<Storage, 'setItem'>, token: string): void {
  const parsed = parseInviteToken(token)
  if (parsed == null) return
  storage.setItem(INVITE_TOKEN_KEY, parsed)
}

export function forgetInviteToken(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(INVITE_TOKEN_KEY)
}

/** Drop the stashed token after success, or when the invite is invalid or expired. */
export function settleInviteToken(
  storage: Pick<Storage, 'removeItem'>,
  result: AcceptResult,
): void {
  if (!result.ok && result.reason === 'wrong-account') return
  storage.removeItem(INVITE_TOKEN_KEY)
}

export function rememberedInviteToken(storage: Pick<Storage, 'getItem'>): string | null {
  return parseInviteToken(storage.getItem(INVITE_TOKEN_KEY))
}

export function inviteTokenFromState(state: unknown): string | null {
  if (state == null || typeof state !== 'object' || !('inviteToken' in state)) return null
  const raw = (state as { inviteToken?: unknown }).inviteToken
  return typeof raw === 'string' ? parseInviteToken(raw) : null
}

/** Login carries the invite in history state. The address bar does not. */
export function loginLocation(token: string): {
  pathname: '/login'
  state: { inviteToken: string }
} {
  return { pathname: '/login', state: { inviteToken: token } }
}

export function asAuthFlowClient(client: SupabaseClient<Database>): AuthFlowClient {
  return {
    auth: {
      signInWithPassword: (credentials) => client.auth.signInWithPassword(credentials),
      signUp: (credentials) => client.auth.signUp(credentials),
      resend: (args) => client.auth.resend(args),
      resetPasswordForEmail: (email, options) => client.auth.resetPasswordForEmail(email, options),
      updateUser: (attributes) => client.auth.updateUser(attributes),
    },
    rpc: async (fn, args) => {
      const { data, error } = await client.rpc(fn, args)
      return { data, error }
    },
  }
}

export async function submitLogin(
  client: AuthFlowClient,
  email: string,
  password: string,
): Promise<FlowOk | FlowFail> {
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, message: mapLoginError(error) }
  return { ok: true }
}

export async function submitSignup(
  client: AuthFlowClient,
  input: {
    email: string
    password: string
    confirm: string
    redirectTo: string
    data?: Record<string, unknown>
  },
): Promise<SignupResult> {
  const issue = passwordIssue(input.password, input.confirm)
  if (issue) return { ok: false, message: issue }
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: input.redirectTo, data: input.data },
  })
  if (error) return { ok: false, message: error.message ?? INVITE_INVALID }
  return { ok: true, needsConfirm: data.session == null }
}

export async function submitInviteSignup(
  client: AuthFlowClient,
  input: { email: string; password: string; confirm: string; token: string; origin: string },
): Promise<SignupResult> {
  const token = parseInviteToken(input.token)
  if (token == null) return { ok: false, message: INVITE_INVALID }
  const issue = passwordIssue(input.password, input.confirm)
  if (issue) return { ok: false, message: issue }
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: inviteRedirect(input.origin, token) },
  })
  if (error) {
    const message = (error.message ?? '').toLowerCase()
    if (message.includes('already registered')) {
      return { ok: false, message: 'Log in with that email to accept the invite.' }
    }
    return { ok: false, message: error.message ?? INVITE_INVALID }
  }
  return { ok: true, needsConfirm: data.session == null }
}

export async function resendSignup(
  client: AuthFlowClient,
  email: string,
  redirectTo?: string,
): Promise<void> {
  await client.auth.resend({
    type: 'signup',
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  })
}

export async function submitForgot(
  client: AuthFlowClient,
  email: string,
  redirectTo: string,
): Promise<FlowOk> {
  try {
    await client.auth.resetPasswordForEmail(email, { redirectTo })
  } catch {
    // The page shows the same sentence whether or not the address exists.
  }
  return { ok: true }
}

export async function submitReset(
  client: AuthFlowClient,
  password: string,
  confirm: string,
): Promise<FlowOk | FlowFail> {
  const issue = passwordIssue(password, confirm)
  if (issue) return { ok: false, message: issue }
  const { error } = await client.auth.updateUser({ password })
  if (error) return { ok: false, message: RESET_EXPIRED }
  return { ok: true }
}

async function runAccept(client: AuthFlowClient, token: string): Promise<AcceptResult> {
  const { error } = await client.rpc('accept_invite', { token })
  if (error) return { ok: false, ...acceptFailure(error) }
  return { ok: true }
}

/** One in-flight call per token. A failed call can be retried; a success is not sent twice. */
export function submitAcceptInvite(client: AuthFlowClient, token: string): Promise<AcceptResult> {
  const parsed = parseInviteToken(token)
  if (parsed == null) {
    return Promise.resolve({ ok: false, message: INVITE_INVALID, reason: 'invalid' })
  }
  const existing = acceptInflight.get(parsed)
  if (existing) return existing
  const pending = runAccept(client, parsed).then((result) => {
    if (!result.ok) acceptInflight.delete(parsed)
    return result
  })
  acceptInflight.set(parsed, pending)
  return pending
}

export function clearAcceptInflight(): void {
  acceptInflight.clear()
}
