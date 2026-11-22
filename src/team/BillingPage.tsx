import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'
import { CreditCard, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import {
  getTeamBilling,
  openBillingPortal,
  startCheckout,
  type PaidPlan,
  type TeamBilling,
} from '../data/billing'
import { supabase } from '../data/supabase'
import { formatBytes } from '../film/uploadPlan'
import {
  CHECKOUT_ENABLED,
  DEMO_BILLING,
  PAID_PLANS,
  PLAN_NAMES,
  checkoutReturn,
  hasRunningPlan,
  limitLabel,
  limitPercent,
  statusLine,
  type StatusTone,
} from './billingView'
import { TeamShell } from './TeamShell'

type Load =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; billing: TeamBilling | null }

/** After Checkout: wait for the webhook to change the plan, then say so. */
type Arrival = 'none' | 'waiting' | 'arrived' | 'slow' | 'canceled'

const POLL_MS = 2000
const POLL_TRIES = 15

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

const fetchLoad = (teamId: string): Promise<Load> =>
  getTeamBilling(teamId).then(
    (billing): Load => ({ status: 'ready', billing }),
    (err: unknown): Load => ({ status: 'error', text: message(err, 'Could not load billing') }),
  )

const TONE: Record<StatusTone, string> = {
  good: 'text-success',
  warn: 'text-destructive',
  muted: 'text-muted-foreground',
}

/**
 * /team/billing: the team's plan, what it uses against the plan's limits, and (for the head
 * coach) Upgrade and Manage billing, both on Stripe's own pages. Assistant coaches see the
 * plan and are told to ask the head coach. Players are sent back to /team by TeamShell.
 */
export function BillingPage({ checkoutEnabled = CHECKOUT_ENABLED }: { checkoutEnabled?: boolean }) {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const demo = supabase == null
  const teamId = snap.teamId
  const { search } = useLocation()
  const [fetched, setFetched] = useState<Load>({ status: 'loading' })
  const [arrival, setArrival] = useState<Arrival>(() => {
    const back = checkoutReturn(search)
    return back === 'success' ? 'waiting' : back === 'canceled' ? 'canceled' : 'none'
  })
  const [busy, setBusy] = useState<PaidPlan | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (demo || teamId == null) return
    let live = true
    void fetchLoad(teamId).then((next) => {
      if (live) setFetched(next)
    })
    return () => {
      live = false
    }
  }, [demo, teamId])

  // Stripe sends the coach back before the webhook may have landed. Poll briefly.
  useEffect(() => {
    if (arrival !== 'waiting' || demo || teamId == null) return
    let tries = 0
    let live = true
    const tick = () =>
      fetchLoad(teamId).then((next) => {
        if (!live) return
        setFetched(next)
        if (next.status === 'ready' && next.billing != null && hasRunningPlan(next.billing)) {
          setArrival('arrived')
        } else if (++tries >= POLL_TRIES) {
          setArrival('slow')
        } else {
          timer = window.setTimeout(tick, POLL_MS)
        }
      })
    let timer = window.setTimeout(tick, POLL_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [arrival, demo, teamId])

  const load: Load = demo ? { status: 'ready', billing: DEMO_BILLING } : fetched

  async function go(action: PaidPlan | 'portal') {
    if (demo || teamId == null) return
    setBusy(action)
    setError(null)
    try {
      const url =
        action === 'portal' ? await openBillingPortal(teamId) : await startCheckout(teamId, action)
      window.location.assign(url)
    } catch (err) {
      setError(message(err, 'Billing is unavailable. Try again in a minute.'))
      setBusy(null)
    }
  }

  return (
    <TeamShell title="Billing" snap={snap} demo={demo}>
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <ArrivalNote arrival={arrival} />
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {load.status === 'loading' ? <p className="text-muted-foreground">Loading…</p> : null}
        {load.status === 'error' ? <p role="alert">{load.text}</p> : null}
        {load.status === 'ready' && load.billing == null ? (
          <p>Only coaches on this team can see its plan.</p>
        ) : null}
        {load.status === 'ready' && load.billing != null ? (
          <BillingBody
            billing={load.billing}
            busy={busy}
            onGo={go}
            checkoutEnabled={checkoutEnabled}
          />
        ) : null}
      </div>
    </TeamShell>
  )
}

function ArrivalNote({ arrival }: { arrival: Arrival }) {
  const text: Record<Arrival, string | null> = {
    none: null,
    waiting: 'Payment received. Updating your plan…',
    arrived: 'You’re all set. Your new plan is active.',
    slow: 'Payment received. Your plan can take a minute to update. Refresh this page soon.',
    canceled: 'Checkout canceled. Nothing was charged.',
  }
  if (text[arrival] == null) return null
  return (
    <p role="status" className="rounded-lg border bg-card p-3 text-sm">
      {text[arrival]}
    </p>
  )
}

function BillingBody({
  billing,
  busy,
  onGo,
  checkoutEnabled,
}: {
  billing: TeamBilling
  busy: PaidPlan | 'portal' | null
  onGo: (action: PaidPlan | 'portal') => void
  checkoutEnabled: boolean
}) {
  const line = statusLine(billing)
  const running = hasRunningPlan(billing)
  const filmMax = billing.filmQuota
  return (
    <>
      <section aria-labelledby="plan-name" className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Your plan</p>
            <h2 id="plan-name" className="text-2xl font-semibold">
              {PLAN_NAMES[billing.plan]}
            </h2>
            {line ? <p className={cn('mt-1 text-sm', TONE[line.tone])}>{line.text}</p> : null}
          </div>
          {billing.isHeadCoach && billing.hasCustomer ? (
            <Button
              variant="outline"
              size="lg"
              disabled={busy != null}
              onClick={() => onGo('portal')}
            >
              <CreditCard /> {busy === 'portal' ? 'Opening…' : 'Manage billing'}
            </Button>
          ) : null}
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Usage label="Coaches" used={billing.usage.coaches} max={billing.limits.coaches} />
          <Usage label="Players" used={billing.usage.players} max={billing.limits.players} />
          <Usage label="Plays" used={billing.usage.plays} max={billing.limits.plays} />
          <Usage
            label="Game film"
            used={billing.usage.filmUsed}
            max={filmMax}
            format={(used, max) =>
              max === 0 ? 'Not included' : `${formatBytes(used)} of ${formatBytes(max ?? 0)}`
            }
          />
        </dl>
      </section>

      {!running ? (
        <section aria-labelledby="upgrade" className="grid gap-3">
          <h2 id="upgrade" className="text-lg font-semibold">
            Upgrade
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {PAID_PLANS.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
                <div>
                  <h3 className="font-semibold">{PLAN_NAMES[p.id]}</h3>
                  <p className="text-lg font-semibold">{p.price}</p>
                </div>
                <p className="flex-1 text-sm text-muted-foreground">{p.blurb}</p>
                {billing.isHeadCoach && !checkoutEnabled ? (
                  <Button size="lg" variant="secondary" disabled>
                    Coming soon
                  </Button>
                ) : billing.isHeadCoach ? (
                  <Button size="lg" disabled={busy != null} onClick={() => onGo(p.id)}>
                    {busy === p.id ? 'Opening checkout…' : `Upgrade to ${PLAN_NAMES[p.id]}`}
                    <ExternalLink />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {!checkoutEnabled ? (
            <p className="text-sm text-muted-foreground">
              Paid plans are coming soon. Your team keeps everything it has today in the meantime.
            </p>
          ) : billing.isHeadCoach ? (
            <p className="text-sm text-muted-foreground">
              You pay on Stripe’s secure page. Plans renew yearly, and you can cancel any time.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask your head coach to upgrade. Only the head coach manages billing.
            </p>
          )}
        </section>
      ) : null}
    </>
  )
}

function Usage({
  label,
  used,
  max,
  format = limitLabel,
}: {
  label: string
  used: number
  max: number | null
  format?: (used: number, max: number | null) => string
}) {
  const pct = max === 0 ? null : limitPercent(used, max)
  return (
    <div className="grid gap-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="grid gap-1.5">
        <span className="tabular-nums">{format(used, max)}</span>
        {pct != null ? (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${label} used`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className={cn('h-full rounded-full', pct >= 100 ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </dd>
    </div>
  )
}
