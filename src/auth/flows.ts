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
export type AcceptResult = { ok: true } | FlowFail

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

export function mapAcceptError(error: FlowError | null): string {
  const message = (error?.message ?? '').toLowerCase()
  if (message.includes('not confirmed')) return CONFIRM_EMAIL
  return INVITE_INVALID
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
  if (error) return { ok: false, message: mapAcceptError(error) }
  return { ok: true }
}

/** One in-flight call per token. A failed call can be retried; a success is not sent twice. */
export function submitAcceptInvite(client: AuthFlowClient, token: string): Promise<AcceptResult> {
  const parsed = parseInviteToken(token)
  if (parsed == null) return Promise.resolve({ ok: false, message: INVITE_INVALID })
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
