import { describe, expect, it } from 'vitest'
import {
  subscriptionState,
  type StripeSubscription,
} from '../supabase/functions/stripe-webhook/subscription'

const base: StripeSubscription = {
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  metadata: { billing_account_id: 'acct-uuid', team_id: 'team-uuid' },
  items: {
    data: [{ quantity: 1, current_period_end: 1825000000, price: { metadata: { plan: 'team' } } }],
  },
}

describe('stripe subscription state', () => {
  it('reads plan, account, customer and period end', () => {
    expect(subscriptionState(base)).toEqual({
      account: 'acct-uuid',
      customer: 'cus_1',
      subscription: 'sub_1',
      plan: 'team',
      status: 'active',
      periodEnd: new Date(1825000000 * 1000).toISOString(),
      filmBlocks: 0,
    })
  })

  it('counts film add-on blocks by quantity', () => {
    const sub = {
      ...base,
      items: {
        data: [...base.items.data, { quantity: 3, price: { metadata: { addon: 'film_50gb' } } }],
      },
    }
    expect(subscriptionState(sub)?.filmBlocks).toBe(3)
  })

  it('falls back to the subscription period and an expanded customer', () => {
    const sub: StripeSubscription = {
      ...base,
      customer: { id: 'cus_2' },
      current_period_end: 1800000000,
      metadata: null,
      items: { data: [{ price: { metadata: { plan: 'program' } } }] },
    }
    expect(subscriptionState(sub)).toMatchObject({
      account: null,
      customer: 'cus_2',
      plan: 'program',
      periodEnd: new Date(1800000000 * 1000).toISOString(),
    })
  })

  it('ignores a subscription with no plan price', () => {
    const sub = { ...base, items: { data: [{ price: { metadata: { other: 'x' } } }] } }
    expect(subscriptionState(sub)).toBeNull()
  })
})
