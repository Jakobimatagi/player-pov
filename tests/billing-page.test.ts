import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { TeamBilling } from '../src/data/billing'
import { BillingPage } from '../src/team/BillingPage'
import {
  DEMO_BILLING,
  checkoutReturn,
  isCheckoutEnabled,
  graceEnds,
  hasRunningPlan,
  limitLabel,
  limitPercent,
  statusLine,
} from '../src/team/billingView'

const paid: TeamBilling = {
  ...DEMO_BILLING,
  plan: 'team',
  limits: { coaches: null, players: null, plays: null },
  filmQuota: 10 * 1024 ** 3,
  status: 'active',
  renewsAt: '2027-11-22T21:50:06Z',
  hasCustomer: true,
}

describe('billing view helpers', () => {
  it('describes each subscription state', () => {
    expect(statusLine(paid)).toEqual({ tone: 'good', text: 'Renews Nov 22, 2027' })
    expect(statusLine({ ...paid, status: 'trialing' })?.text).toBe('Trial ends Nov 22, 2027')
    expect(
      statusLine({ ...paid, status: 'past_due', pastDueSince: '2026-11-01T12:00:00Z' }),
    ).toEqual({
      tone: 'warn',
      text: 'Payment failed. Update your card by Nov 15, 2026 to keep your plan.',
    })
    expect(statusLine({ ...paid, plan: 'starter', status: 'canceled' })?.tone).toBe('muted')
    expect(statusLine(DEMO_BILLING)).toBeNull()
  })

  it('counts the 14-day grace from the first failed payment', () => {
    expect(graceEnds('2026-11-01T12:00:00Z')).toBe('Nov 15, 2026')
  })

  it('treats active, trialing and past due as a running plan', () => {
    expect(hasRunningPlan(paid)).toBe(true)
    expect(hasRunningPlan({ ...paid, status: 'past_due' })).toBe(true)
    expect(hasRunningPlan({ ...paid, status: 'canceled' })).toBe(false)
    expect(hasRunningPlan(DEMO_BILLING)).toBe(false)
  })

  it('labels limits and meters', () => {
    expect(limitLabel(18, 25)).toBe('18 of 25')
    expect(limitLabel(40, null)).toBe('40 · unlimited')
    expect(limitPercent(12, 15)).toBe(80)
    expect(limitPercent(30, 25)).toBe(100)
    expect(limitPercent(3, null)).toBeNull()
  })

  it('shows a manual plan as running, with its end date', () => {
    const manual = {
      ...paid,
      status: null,
      hasCustomer: false,
      manualUntil: '2027-08-01T12:00:00Z',
    }
    expect(statusLine(manual)).toEqual({ tone: 'good', text: 'Included until Aug 1, 2027' })
    expect(hasRunningPlan(manual, Date.parse('2026-11-22T00:00:00Z'))).toBe(true)
    expect(hasRunningPlan(manual, Date.parse('2027-09-01T00:00:00Z'))).toBe(false)
  })

  it('keeps checkout off unless the switch is exactly true', () => {
    expect(isCheckoutEnabled(undefined)).toBe(false)
    expect(isCheckoutEnabled('')).toBe(false)
    expect(isCheckoutEnabled('false')).toBe(false)
    expect(isCheckoutEnabled('true')).toBe(true)
  })

  it('reads the Checkout return', () => {
    expect(checkoutReturn('?checkout=success')).toBe('success')
    expect(checkoutReturn('?checkout=canceled')).toBe('canceled')
    expect(checkoutReturn('?checkout=other')).toBeNull()
    expect(checkoutReturn('')).toBeNull()
  })
})

describe('billing page (no backend)', () => {
  const render = (path: string, checkoutEnabled = true) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(BillingPage, { checkoutEnabled }),
      ),
    )

  it('shows Starter usage against its limits and both upgrades', () => {
    const html = render('/team/billing')
    expect(html).toContain('Starter')
    expect(html).toContain('18 of 25')
    expect(html).toContain('12 of 15')
    expect(html).toContain('Not included')
    expect(html).toContain('Upgrade to Team')
    expect(html).toContain('Upgrade to Program')
    expect(html).not.toContain('Manage billing')
  })

  it('shows Coming soon instead of the upgrades while checkout is off', () => {
    const html = render('/team/billing', false)
    expect(html).toContain('Coming soon')
    expect(html).toContain('Paid plans are coming soon.')
    expect(html).not.toContain('Upgrade to Team')
    expect(html).not.toContain('Upgrade to Program')
    expect(html).not.toContain('Stripe’s secure page')
  })

  it('confirms a canceled checkout', () => {
    expect(render('/team/billing?checkout=canceled')).toContain(
      'Checkout canceled. Nothing was charged.',
    )
  })
})
