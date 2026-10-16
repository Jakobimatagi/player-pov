import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const box = vi.hoisted(() => ({
  membership: [] as { role: string }[],
  delayMs: 0,
  onChange: null as
    ((event: string, session: { user: { id: string; email: string } } | null) => void) | null,
  session: null as { user: { id: string; email: string } } | null,
}))

vi.mock('../src/data/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (
        cb: (event: string, session: { user: { id: string; email: string } } | null) => void,
      ) => {
        box.onChange = cb
        return { data: { subscription: { unsubscribe() {} } } }
      },
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ data: box.membership, error: null }), box.delayMs)
            }),
        }),
      }),
    }),
  },
}))

async function loadSession() {
  vi.resetModules()
  return import('../src/auth/session')
}

async function signIn(user: { id: string; email: string }) {
  box.session = { user }
  box.onChange?.('SIGNED_IN', box.session)
}

describe('login waits for the membership query', () => {
  beforeEach(() => {
    box.membership = []
    box.delayMs = 0
    box.onChange = null
    box.session = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not settle until the player membership is published', async () => {
    box.membership = [{ role: 'player' }]
    box.delayMs = 40
    const session = await loadSession()
    session.startAuth()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(session.getAuthSnap().session).toBeNull()

    let settled = false
    const pending = session.waitForMembership().then((snap) => {
      settled = true
      return snap
    })
    signIn({ id: 'player-id', email: 'player@demo.local' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    expect(session.getAuthSnap().session).toBeNull()

    const snap = await pending
    expect(snap.role).toBe('player')
    expect(
      session.destination({
        backend: true,
        ready: snap.ready,
        hasSession: snap.session != null,
        role: snap.role,
        membershipLoaded: snap.membershipLoaded,
        membershipError: snap.membershipError,
      }),
    ).toBe('player')
  })

  it('sends a coach with no membership to create team', async () => {
    box.membership = []
    const session = await loadSession()
    session.startAuth()
    await new Promise((resolve) => setTimeout(resolve, 0))
    signIn({ id: 'coach-id', email: 'coach@demo.local' })
    const snap = await session.waitForMembership()
    expect(snap.role).toBeNull()
    expect(
      session.destination({
        backend: true,
        ready: true,
        hasSession: true,
        role: snap.role,
        membershipLoaded: true,
        membershipError: false,
      }),
    ).toBe('create-team')
  })

  it('reloads the role after accept_invite inserts a membership', async () => {
    box.membership = []
    const session = await loadSession()
    session.startAuth()
    await new Promise((resolve) => setTimeout(resolve, 0))
    signIn({ id: 'invitee-id', email: 'invitee@demo.local' })
    const before = await session.waitForMembership()
    expect(before.role).toBeNull()
    box.membership = [{ role: 'player' }]
    await session.reloadMembership()
    expect(session.getAuthSnap().role).toBe('player')
    expect(
      session.destination({
        backend: true,
        ready: true,
        hasSession: true,
        role: session.getAuthSnap().role,
        membershipLoaded: true,
        membershipError: false,
      }),
    ).toBe('player')
  })

  it('rejects with a visible error when membership does not arrive', async () => {
    box.membership = [{ role: 'player' }]
    box.delayMs = 60_000
    const session = await loadSession()
    session.startAuth()
    await new Promise((resolve) => setTimeout(resolve, 0))
    vi.useFakeTimers()
    signIn({ id: 'player-id', email: 'player@demo.local' })
    const pending = session.waitForMembership()
    const failed = expect(pending).rejects.toThrow(session.MEMBERSHIP_TIMEOUT)
    await vi.advanceTimersByTimeAsync(session.MEMBERSHIP_WAIT_MS)
    await failed
    expect(session.getAuthSnap().session).toBeNull()
    const pages = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/auth/pages.tsx', import.meta.url), 'utf8'),
    )
    expect(pages).toContain('setError(MEMBERSHIP_TIMEOUT)')
  })
})
