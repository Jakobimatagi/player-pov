// Turns a Stripe subscription object into the state billing_apply_subscription stores.
// No Deno or Stripe imports, so the unit tests run it directly.

export type PaidPlan = 'team' | 'program'

export type SubscriptionState = {
  account: string | null
  customer: string | null
  subscription: string
  plan: PaidPlan
  status: string
  periodEnd: string | null
  filmBlocks: number
}

type Item = {
  quantity?: number | null
  current_period_end?: number | null
  price: { metadata?: Record<string, string> | null }
}

export type StripeSubscription = {
  id: string
  customer: string | { id: string } | null
  status: string
  metadata?: Record<string, string> | null
  current_period_end?: number | null
  items: { data: Item[] }
}

const PLANS: readonly string[] = ['team', 'program']

/** Null when no item carries a plan, e.g. a subscription made outside this app. */
export function subscriptionState(sub: StripeSubscription): SubscriptionState | null {
  const planItem = sub.items.data.find((i) => PLANS.includes(i.price.metadata?.plan ?? ''))
  if (planItem == null) return null
  const filmBlocks = sub.items.data
    .filter((i) => i.price.metadata?.addon === 'film_50gb')
    .reduce((n, i) => n + (i.quantity ?? 1), 0)
  // Newer API versions keep the period on each item; older ones on the subscription.
  const periodEnd = planItem.current_period_end ?? sub.current_period_end ?? null
  return {
    account: sub.metadata?.billing_account_id ?? null,
    customer: typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null),
    subscription: sub.id,
    plan: planItem.price.metadata?.plan as PaidPlan,
    status: sub.status,
    periodEnd: periodEnd == null ? null : new Date(periodEnd * 1000).toISOString(),
    filmBlocks,
  }
}

export const SUBSCRIPTION_EVENTS: ReadonlySet<string> = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
])
