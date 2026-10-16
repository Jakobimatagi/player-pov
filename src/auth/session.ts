import type { Session } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import type { TeamRole } from '../data/database.types'

export const INACTIVITY_MS = 14 * 24 * 60 * 60 * 1000
export const LAST_ACTIVE_KEY = 'last_active'

export const LOGIN_ERROR = 'Email or password is incorrect'
export const CONFIRM_EMAIL = 'Confirm your email first'
export const FORGOT_SENT = 'If that email has an account, a link is on its way'
export const RESET_EXPIRED = 'This link has expired'
export const SESSION_EXPIRED = 'Session expired, sign in again.'
export const SIGNED_OUT = "You're signed out."
export const INVITE_INVALID =
  'This invite is no longer valid. Ask your coach for a new one, or log in.'
export const MEMBERSHIP_WAIT_MS = 10_000
export const MEMBERSHIP_TIMEOUT = "Couldn't load your team. Try again."

export type HomeKind = 'viewer' | 'loading' | 'login' | 'player' | 'staff' | 'create-team' | 'error'

export function inactivityExpired(lastActive: string | null, now: number): boolean {
  if (lastActive == null || lastActive === '') return false
  const then = Number(lastActive)
  if (!Number.isFinite(then)) return false
  return now - then > INACTIVITY_MS
}

/** Same-origin path only. Anything else becomes `/`. */
export function safeNext(raw: string | null): string {
  if (raw == null || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/'
  return raw
}

export function mapLoginError(error: { code?: string; message?: string } | null): string {
  const code = error?.code ?? ''
  const message = (error?.message ?? '').toLowerCase()
  if (code === 'email_not_confirmed' || message.includes('not confirmed')) return CONFIRM_EMAIL
  return LOGIN_ERROR
}

export function passwordIssue(password: string, confirm: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters'
  if (password !== confirm) return 'Passwords do not match'
  return null
}

export function linkExpired(search: string, hash: string): boolean {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const code = query.get('error_code') ?? fragment.get('error_code') ?? ''
  const err = query.get('error') ?? fragment.get('error') ?? ''
  return code === 'otp_expired' || err === 'access_denied' || query.get('expired') === '1'
}

export function destination(input: {
  backend: boolean
  ready: boolean
  hasSession: boolean
  role: TeamRole | null
  membershipLoaded: boolean
  membershipError: boolean
}): HomeKind {
  if (!input.backend) return 'viewer'
  if (!input.ready || (input.hasSession && !input.membershipLoaded)) return 'loading'
  if (!input.hasSession) return 'login'
  if (input.membershipError) return 'error'
  if (input.role == null) return 'create-team'
  if (input.role === 'player') return 'player'
  return 'staff'
}

export type AuthSnap = {
  ready: boolean
  session: Session | null
  role: TeamRole | null
  membershipLoaded: boolean
  membershipError: boolean
  expired: boolean
}

const listeners = new Set<() => void>()
let snap: AuthSnap = {
  ready: supabase == null,
  session: null,
  role: null,
  membershipLoaded: supabase == null,
  membershipError: false,
  expired: false,
}
let started = false

function publish(next: AuthSnap): void {
  snap = next
  for (const listener of listeners) listener()
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAuthSnap(): AuthSnap {
  return snap
}

/** True once a signed-in user's membership query has finished. */
export function membershipSettled(snap: AuthSnap): boolean {
  return snap.ready && snap.session != null && snap.membershipLoaded
}

export function waitForMembership(timeoutMs = MEMBERSHIP_WAIT_MS): Promise<AuthSnap> {
  const current = getAuthSnap()
  if (membershipSettled(current)) return Promise.resolve(current)
  return new Promise((resolve, reject) => {
    let stop = (): void => {}
    const timer = setTimeout(() => {
      stop()
      reject(new Error(MEMBERSHIP_TIMEOUT))
    }, timeoutMs)
    stop = subscribeAuth(() => {
      const next = getAuthSnap()
      if (!membershipSettled(next)) return
      clearTimeout(timer)
      stop()
      resolve(next)
    })
  })
}

async function loadRole(userId: string): Promise<{
  role: TeamRole | null
  error: boolean
}> {
  if (supabase == null) return { role: null, error: false }
  const { data, error } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .limit(1)
  if (error) return { role: null, error: true }
  const role = data?.[0]?.role ?? null
  return { role, error: false }
}

async function applySession(session: Session | null, expired: boolean): Promise<void> {
  if (session == null) {
    publish({
      ready: true,
      session: null,
      role: null,
      membershipLoaded: true,
      membershipError: false,
      expired,
    })
    return
  }
  const membership = await loadRole(session.user.id)
  publish({
    ready: true,
    session,
    role: membership.role,
    membershipLoaded: true,
    membershipError: membership.error,
    expired,
  })
}

export async function reloadMembership(): Promise<void> {
  if (supabase == null || snap.session == null) return
  await applySession(snap.session, false)
}

export function startAuth(): void {
  if (started || supabase == null) return
  started = true
  const client = supabase
  void client.auth.getSession().then(async ({ data }) => {
    const session = data.session
    if (session && inactivityExpired(localStorage.getItem(LAST_ACTIVE_KEY), Date.now())) {
      localStorage.removeItem(LAST_ACTIVE_KEY)
      await client.auth.signOut()
      await applySession(null, true)
      return
    }
    if (session) localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
    await applySession(session, false)
  })
  client.auth.onAuthStateChange((_event, session) => {
    void applySession(session, false)
  })
}

export function noteActivity(now = Date.now()): void {
  if (snap.session == null) return
  localStorage.setItem(LAST_ACTIVE_KEY, String(now))
}

export async function signOut(scope: 'local' | 'global'): Promise<void> {
  localStorage.removeItem(LAST_ACTIVE_KEY)
  await supabase?.auth.signOut({ scope })
  await applySession(null, false)
}
