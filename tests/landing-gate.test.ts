import { describe, expect, it } from 'vitest'
import { showLanding } from '../src/landing/gate'

const visitor = { pathname: '/', search: '', hash: '', backend: true, storageKeys: [] }

describe('landing gate', () => {
  it('shows the landing page to a logged-out visitor at /', () => {
    expect(showLanding(visitor)).toBe(true)
    expect(
      showLanding({ ...visitor, storageKeys: ['theme', 'sb-abc-auth-token-code-verifier'] }),
    ).toBe(true)
  })

  it('loads the app when a session is saved', () => {
    expect(showLanding({ ...visitor, storageKeys: ['sb-abcdefgh-auth-token'] })).toBe(false)
  })

  it('loads the app for deep links, auth redirects and demo links', () => {
    expect(showLanding({ ...visitor, pathname: '/watch/abc' })).toBe(false)
    expect(showLanding({ ...visitor, pathname: '/login' })).toBe(false)
    expect(showLanding({ ...visitor, search: '?code=123' })).toBe(false)
    expect(showLanding({ ...visitor, hash: '#access_token=x' })).toBe(false)
    expect(showLanding({ ...visitor, search: '?home=coach' })).toBe(false)
  })

  it('keeps the engine viewer when there is no backend', () => {
    expect(showLanding({ ...visitor, backend: false })).toBe(false)
  })
})
