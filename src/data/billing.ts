import { supabase } from './supabase'

export type PlanId = 'starter' | 'team' | 'program'
export type PaidPlan = Exclude<PlanId, 'starter'>

/** What the billing page shows. Payment fields are null unless the caller is the head coach. */
export interface TeamBilling {
  plan: PlanId
  limits: { coaches: number | null; players: number | null; plays: number | null }
  usage: { coaches: number; players: number; plays: number; filmUsed: number }
  filmQuota: number
  isHeadCoach: boolean
  status: string | null
  renewsAt: string | null
  pastDueSince: string | null
  hasCustomer: boolean
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

/** Null when the caller is not staff on the team. */
export async function getTeamBilling(teamId: string): Promise<TeamBilling | null> {
  const { data, error } = await client().rpc('team_billing', { p_team: teamId })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (row == null) return null
  return {
    plan: row.plan,
    limits: { coaches: row.max_coaches, players: row.max_players, plays: row.max_plays },
    usage: {
      coaches: row.coaches,
      players: row.players,
      plays: row.plays,
      filmUsed: row.film_used,
    },
    filmQuota: row.film_quota,
    isHeadCoach: row.is_head_coach,
    status: row.status,
    renewsAt: row.renews_at,
    pastDueSince: row.past_due_since,
    hasCustomer: row.has_customer === true,
  }
}

async function callBilling(body: Record<string, unknown>): Promise<string> {
  const { data, error } = await client().functions.invoke('billing', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = context ? await context.json().catch(() => null) : null
    throw new Error((detail as { error?: string } | null)?.error ?? error.message)
  }
  return (data as { url: string }).url
}

/** A Stripe Checkout URL for the plan. Head coach only. */
export function startCheckout(teamId: string, plan: PaidPlan): Promise<string> {
  return callBilling({ action: 'checkout', teamId, plan })
}

/** A Stripe customer portal URL (card, cancel, receipts). Head coach only. */
export function openBillingPortal(teamId: string): Promise<string> {
  return callBilling({ action: 'portal', teamId })
}
