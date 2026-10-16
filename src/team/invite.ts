import type { PositionCode, TeamRole } from '../data/database.types'

export const CONSENT_STATEMENT =
  "I confirm this player's parent/guardian or school has consented to this account"
export const CONSENT_HINT = 'Confirm consent to invite a player'
export const ALREADY_ON_ROSTER = 'Already on the roster'
export const OWNER_ONLY = 'Only the team owner can add a head coach.'

export const POSITIONS: PositionCode[] = [
  'QB',
  'RB',
  'FB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'CB',
  'S',
  'K',
  'ATH',
]

export function roleLabel(role: TeamRole): string {
  if (role === 'head_coach') return 'Head coach'
  if (role === 'coach') return 'Coach'
  return 'Player'
}

export function inviteLink(origin: string, token: string): string {
  return `${origin}/accept-invite?token=${token}`
}

export function mapTeamError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('already on the roster')) return ALREADY_ON_ROSTER
  if (text.includes('confirm consent')) return CONSENT_HINT
  if (text.includes('only the team owner')) return OWNER_ONLY
  if (text.includes('confirm your email')) return 'Confirm your email first'
  if (text.includes('you already have a team')) return 'You already have a team.'
  return "Couldn't save that."
}

type RpcError = { message?: string } | null
type RpcResult = PromiseLike<{ data: string | null; error: RpcError }>

export type TeamRpc = {
  rpc: {
    (
      fn: 'create_team',
      args: {
        p_name: string
        p_school: string
        p_season: string
        p_hash_rule: string
        p_season_ends_on: string
      },
    ): RpcResult
    (
      fn: 'create_invite',
      args: {
        p_team: string
        p_email: string
        p_name: string
        p_role: TeamRole
        p_position: PositionCode | null
        p_statement: string
      },
    ): RpcResult
  }
}

export async function submitCreateTeam(
  client: TeamRpc,
  input: {
    name: string
    school: string
    season: string
    hashRule: string
    seasonEndsOn: string
  },
): Promise<{ ok: true; teamId: string } | { ok: false; message: string }> {
  const { data, error } = await client.rpc('create_team', {
    p_name: input.name,
    p_school: input.school,
    p_season: input.season,
    p_hash_rule: input.hashRule,
    p_season_ends_on: input.seasonEndsOn,
  })
  if (error || data == null) return { ok: false, message: mapTeamError(error?.message ?? '') }
  return { ok: true, teamId: data }
}

export async function submitInvite(
  client: TeamRpc,
  input: {
    teamId: string
    email: string
    name: string
    role: TeamRole
    position: PositionCode | null
    statement: string
    origin: string
  },
): Promise<{ ok: true; link: string } | { ok: false; message: string }> {
  if (input.role === 'player' && input.statement.trim() === '') {
    return { ok: false, message: CONSENT_HINT }
  }
  const { data, error } = await client.rpc('create_invite', {
    p_team: input.teamId,
    p_email: input.email,
    p_name: input.name,
    p_role: input.role,
    p_position: input.position,
    p_statement: input.statement,
  })
  if (error || data == null) return { ok: false, message: mapTeamError(error?.message ?? '') }
  return { ok: true, link: inviteLink(input.origin, data) }
}

export async function saveMember(
  update: (values: {
    role: TeamRole
    position: PositionCode | null
  }) => PromiseLike<{ error: RpcError }>,
  values: { role: TeamRole; position: PositionCode | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await update(values)
  if (error) return { ok: false, message: mapTeamError(error.message ?? '') }
  return { ok: true }
}

export async function revokeInvite(
  client: {
    from: (table: 'invites') => {
      delete: () => { eq: (column: string, value: string) => PromiseLike<{ error: RpcError }> }
    }
  },
  inviteId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client.from('invites').delete().eq('id', inviteId)
  if (error) return { ok: false, message: mapTeamError(error.message ?? '') }
  return { ok: true }
}
