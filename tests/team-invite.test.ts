import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('team invite', () => {
  it('requires consent in the edge function and keeps the service role out of the app', () => {
    const fn = readFileSync(
      new URL('../supabase/functions/invite-member/index.ts', import.meta.url),
      'utf8',
    )
    const app = readFileSync(new URL('../src/data/supabase.ts', import.meta.url), 'utf8')
    const sql = readFileSync(
      new URL('../supabase/migrations/20261015140200_team.sql', import.meta.url),
      'utf8',
    )
    expect(fn).toContain('Confirm consent to invite a player')
    expect(fn).toContain(
      "I confirm this player's parent/guardian or school has consented to this account",
    )
    expect(sql).toContain('consent-v0-provisional')
    expect(sql).toContain('cannot remove the last head coach')
    expect(sql).toContain('Already on the roster')
    expect(sql).toContain('revoke_invite')
    expect(sql).toContain('delete_member_data')
    expect(app).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(readFileSync(new URL('../src/team/TeamPage.tsx', import.meta.url), 'utf8')).not.toMatch(
      /jersey/i,
    )
  })
})
