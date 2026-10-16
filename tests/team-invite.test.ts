import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  ALREADY_ON_ROSTER,
  CONSENT_HINT,
  CONSENT_STATEMENT,
  inviteLink,
  revokeInvite,
  saveMember,
  submitCreateTeam,
  submitInvite,
} from '../src/team/invite'

const TOKEN = 'a'.repeat(64)

describe('team invites', () => {
  it('creates a team without reading user metadata', async () => {
    const rpc = vi.fn(async () => ({ data: 'team-1', error: null }))
    const result = await submitCreateTeam(
      { rpc },
      {
        name: 'Lone Peak Knights 2026',
        school: 'Lone Peak',
        season: '2026',
        hashRule: 'NFHS',
        seasonEndsOn: '2026-11-30',
      },
    )
    expect(result).toEqual({ ok: true, teamId: 'team-1' })
    expect(rpc).toHaveBeenCalledWith('create_team', {
      p_name: 'Lone Peak Knights 2026',
      p_school: 'Lone Peak',
      p_season: '2026',
      p_hash_rule: 'NFHS',
      p_season_ends_on: '2026-11-30',
    })
    const source = readFileSync(new URL('../src/team/invite.ts', import.meta.url), 'utf8')
    const page = readFileSync(new URL('../src/team/TeamPage.tsx', import.meta.url), 'utf8')
    const sql = readFileSync(
      new URL('../supabase/migrations/20261015140200_team.sql', import.meta.url),
      'utf8',
    )
    expect(source + page + sql).not.toMatch(/user_metadata|raw_user_meta_data/)
    expect(source + page).not.toMatch(/invite-member/)
    expect(sql).not.toMatch(/create function (public|app)\.accept_invite/)
  })

  it('returns a copyable link and does not send mail', async () => {
    const rpc = vi.fn(async () => ({ data: TOKEN, error: null }))
    const result = await submitInvite(
      { rpc },
      {
        teamId: 'team-1',
        email: 'wr1@example.com',
        name: 'Sam Lee',
        role: 'player',
        position: 'WR',
        statement: CONSENT_STATEMENT,
        origin: 'http://127.0.0.1:5173',
      },
    )
    expect(result).toEqual({
      ok: true,
      link: inviteLink('http://127.0.0.1:5173', TOKEN),
    })
    expect(rpc).toHaveBeenCalledWith('create_invite', {
      p_team: 'team-1',
      p_email: 'wr1@example.com',
      p_name: 'Sam Lee',
      p_role: 'player',
      p_position: 'WR',
      p_statement: CONSENT_STATEMENT,
    })
  })

  it('requires consent before a player invite and maps roster conflicts', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'Already on the roster' } }))
    const blocked = await submitInvite(
      { rpc },
      {
        teamId: 'team-1',
        email: 'wr1@example.com',
        name: 'Sam Lee',
        role: 'player',
        position: 'WR',
        statement: '',
        origin: 'http://127.0.0.1:5173',
      },
    )
    expect(blocked).toEqual({ ok: false, message: CONSENT_HINT })
    expect(rpc).not.toHaveBeenCalled()
    const taken = await submitInvite(
      { rpc },
      {
        teamId: 'team-1',
        email: 'wr1@example.com',
        name: 'Sam Lee',
        role: 'player',
        position: 'WR',
        statement: CONSENT_STATEMENT,
        origin: 'http://127.0.0.1:5173',
      },
    )
    expect(taken).toEqual({ ok: false, message: ALREADY_ON_ROSTER })
  })

  it('updates only role and position, and revokes by deleting the invite', async () => {
    const update = vi.fn<
      (values: { role: string; position: string | null }) => Promise<{ error: null }>
    >(async () => ({ error: null }))
    const eqId = vi.fn(async () => ({ error: null }))
    const remove = vi.fn(() => ({ eq: eqId }))
    const saved = await saveMember(update, { role: 'player', position: 'TE' })
    expect(saved).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ role: 'player', position: 'TE' })
    expect(update.mock.calls[0]?.[0]).toEqual({ role: 'player', position: 'TE' })
    const revoked = await revokeInvite({ from: () => ({ delete: remove }) }, 'invite-1')
    expect(revoked).toEqual({ ok: true })
    expect(remove).toHaveBeenCalled()
    expect(eqId).toHaveBeenCalledWith('id', 'invite-1')
  })
})
