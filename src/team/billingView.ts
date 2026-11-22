import type { PaidPlan, PlanId, TeamBilling } from '../data/billing'

// Prices are in Stripe; these are the labels the page shows (marketing/plans.md).
export const PLAN_NAMES: Record<PlanId, string> = {
  starter: 'Starter',
  team: 'Team',
  program: 'Program',
}

export const PAID_PLANS: readonly { id: PaidPlan; price: string; blurb: string }[] = [
  {
    id: 'team',
    price: '$499 / year',
    blurb:
      'Unlimited coaches, players and plays. Homework, scout packs, depth chart and 10 GB of film.',
  },
  {
    id: 'program',
    price: '$899 / year',
    blurb: 'Everything in Team for up to 4 teams, 10 GB of film each, and a setup call.',
  },
]

/** Shown with no backend, so the page can be reviewed and tested. */
export const DEMO_BILLING: TeamBilling = {
  plan: 'starter',
  limits: { coaches: 1, players: 25, plays: 15 },
  usage: { coaches: 1, players: 18, plays: 12, filmUsed: 0 },
  filmQuota: 0,
  isHeadCoach: true,
  status: null,
  renewsAt: null,
  pastDueSince: null,
  hasCustomer: false,
}

const GRACE_DAYS = 14
const PAID_STATUSES = ['active', 'trialing', 'past_due']

export type StatusTone = 'good' | 'warn' | 'muted'

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** The last day of the 14-day grace that started when a payment first failed. */
export function graceEnds(pastDueSince: string): string {
  return dateLabel(new Date(Date.parse(pastDueSince) + GRACE_DAYS * 86_400_000).toISOString())
}

/** One line under the plan name. Null for an assistant coach or a team that never paid. */
export function statusLine(b: TeamBilling): { tone: StatusTone; text: string } | null {
  switch (b.status) {
    case 'active':
      return { tone: 'good', text: b.renewsAt ? `Renews ${dateLabel(b.renewsAt)}` : 'Active' }
    case 'trialing':
      return { tone: 'good', text: b.renewsAt ? `Trial ends ${dateLabel(b.renewsAt)}` : 'Trial' }
    case 'past_due':
      return {
        tone: 'warn',
        text: b.pastDueSince
          ? `Payment failed. Update your card by ${graceEnds(b.pastDueSince)} to keep your plan.`
          : 'Payment failed. Update your card to keep your plan.',
      }
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return {
        tone: 'muted',
        text: 'Your paid plan has ended. Your plays and film are still here.',
      }
    case 'incomplete':
      return { tone: 'warn', text: 'Checkout was not finished.' }
    default:
      return null
  }
}

/** True while a subscription is running, so the coach manages it instead of buying again. */
export function hasRunningPlan(b: TeamBilling): boolean {
  return b.status != null && PAID_STATUSES.includes(b.status)
}

export function limitLabel(used: number, max: number | null): string {
  return max == null ? `${used} · unlimited` : `${used} of ${max}`
}

/** 0 to 100 for a meter, or null when unlimited. */
export function limitPercent(used: number, max: number | null): number | null {
  if (max == null) return null
  if (max <= 0) return 100
  return Math.min(100, Math.round((used / max) * 100))
}

export type CheckoutReturn = 'success' | 'canceled' | null

export function checkoutReturn(search: string): CheckoutReturn {
  const value = new URLSearchParams(search).get('checkout')
  return value === 'success' || value === 'canceled' ? value : null
}
