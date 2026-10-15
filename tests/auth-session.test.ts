import { describe, expect, it } from 'vitest'
import {
  CONFIRM_EMAIL,
  destination,
  FORGOT_SENT,
  INACTIVITY_MS,
  inactivityExpired,
  linkExpired,
  LOGIN_ERROR,
  mapLoginError,
  passwordIssue,
  safeNext,
} from '../src/auth/session'

describe('auth session', () => {
  it('expires a session after 14 days of inactivity', () => {
    const now = 1_700_000_000_000
    expect(inactivityExpired(String(now - INACTIVITY_MS), now)).toBe(false)
    expect(inactivityExpired(String(now - INACTIVITY_MS - 1), now)).toBe(true)
    expect(inactivityExpired(null, now)).toBe(false)
    expect(inactivityExpired('nope', now)).toBe(false)
  })

  it('keeps next on this site', () => {
    expect(safeNext('/watch/abc?cam=pov')).toBe('/watch/abc?cam=pov')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext(null)).toBe('/')
  })

  it('uses one login error and a separate unconfirmed message', () => {
    expect(mapLoginError({ code: 'invalid_credentials', message: 'Invalid login' })).toBe(
      LOGIN_ERROR,
    )
    expect(mapLoginError({ message: 'wrong password' })).toBe(LOGIN_ERROR)
    expect(mapLoginError({ code: 'email_not_confirmed' })).toBe(CONFIRM_EMAIL)
    expect(LOGIN_ERROR).toBe('Email or password is incorrect')
  })

  it('checks password length and the forgot-password copy', () => {
    expect(passwordIssue('short', 'short')).toBe('Use at least 10 characters')
    expect(passwordIssue('password1234', 'password12345')).toBe('Passwords do not match')
    expect(passwordIssue('password1234', 'password1234')).toBeNull()
    expect(FORGOT_SENT).toBe('If that email has an account, a link is on its way')
  })

  it('detects an expired reset or invite link', () => {
    expect(linkExpired('?error_code=otp_expired', '')).toBe(true)
    expect(linkExpired('', '#error=access_denied&error_code=otp_expired')).toBe(true)
    expect(linkExpired('?expired=1', '')).toBe(true)
    expect(linkExpired('', '')).toBe(false)
  })

  it('sends a signed-out app to login and a player home', () => {
    expect(
      destination({
        backend: false,
        ready: true,
        hasSession: false,
        role: null,
        membershipLoaded: true,
        membershipError: false,
      }),
    ).toBe('viewer')
    expect(
      destination({
        backend: true,
        ready: true,
        hasSession: false,
        role: null,
        membershipLoaded: true,
        membershipError: false,
      }),
    ).toBe('login')
    expect(
      destination({
        backend: true,
        ready: true,
        hasSession: true,
        role: null,
        membershipLoaded: true,
        membershipError: false,
      }),
    ).toBe('create-team')
    expect(
      destination({
        backend: true,
        ready: true,
        hasSession: true,
        role: 'player',
        membershipLoaded: true,
        membershipError: false,
      }),
    ).toBe('player')
    expect(
      destination({
        backend: true,
        ready: true,
        hasSession: true,
        role: 'head_coach',
        membershipLoaded: true,
        membershipError: false,
      }),
    ).toBe('staff')
    expect(
      destination({
        backend: true,
        ready: true,
        hasSession: true,
        role: null,
        membershipLoaded: true,
        membershipError: false,
        lostAccess: true,
      }),
    ).toBe('removed')
  })
})
