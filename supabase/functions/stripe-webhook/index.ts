// Stripe webhook (issue #63, step 2). Stripe calls this, not the browser, so it runs with
// verify_jwt = false (supabase/config.toml) and proves the caller by the Stripe signature.
//
// Every subscription event carries the whole subscription, so the handler writes that
// state rather than replaying a change. public.billing_apply_subscription records the
// event id (a retry is a no-op) and skips events older than the last one applied.
// A database error returns 500 so Stripe retries.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided.
import Stripe from 'npm:stripe@18.5.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'
import { SUBSCRIPTION_EVENTS, subscriptionState, type StripeSubscription } from './subscription.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const signature = req.headers.get('Stripe-Signature')
  if (signature == null) return Response.json({ error: 'Missing signature' }, { status: 400 })

  const payload = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      cryptoProvider,
    )
  } catch {
    return Response.json({ error: 'Bad signature' }, { status: 400 })
  }

  if (!SUBSCRIPTION_EVENTS.has(event.type)) return Response.json({ result: 'ignored' })
  const state = subscriptionState(event.data.object as unknown as StripeSubscription)
  if (state == null) return Response.json({ result: 'no_plan' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data, error } = await admin.rpc('billing_apply_subscription', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_at: new Date(event.created * 1000).toISOString(),
    p_account: state.account,
    p_customer: state.customer,
    p_subscription: state.subscription,
    p_plan: state.plan,
    p_status: state.status,
    p_period_end: state.periodEnd,
    p_film_blocks: state.filmBlocks,
  })
  if (error) {
    console.error('billing_apply_subscription failed', event.id, error.message)
    return Response.json({ error: 'Could not apply event' }, { status: 500 })
  }
  return Response.json({ result: data })
})
