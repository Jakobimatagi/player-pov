// Billing actions for a team's head coach (issue #63, step 2).
//
//   { action: 'checkout', teamId, plan: 'team' | 'program' } → { url } of a Stripe Checkout page
//   { action: 'portal', teamId }                             → { url } of the Stripe customer portal
//
// Only the team's head coach gets a URL; everyone else gets 403. The plan changes only when
// the stripe-webhook function hears from Stripe, never from here. Prices are found by
// lookup key (team_yearly, program_yearly), so test and live mode run the same code.
//
// Secrets: STRIPE_SECRET_KEY, APP_URL. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided.
import Stripe from 'npm:stripe@18.5.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
})
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
const ACTIVE = ['active', 'trialing', 'past_due']

const ORIGINS = new Set(
  [
    APP_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(','),
  ]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
)

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (!ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

type Body = { action?: string; teamId?: string; plan?: string }

type Account = {
  id: string
  stripe_customer_id: string | null
  status: string | null
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function handle(req: Request): Promise<{ url: string }> {
  const body = (await req.json().catch(() => ({}))) as Body
  if (body.action !== 'checkout' && body.action !== 'portal') {
    throw new HttpError(400, 'Unknown action')
  }
  if (typeof body.teamId !== 'string') throw new HttpError(400, 'teamId is required')

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await user.auth.getUser()
  if (auth.user == null) throw new HttpError(401, 'Sign in required')

  // RLS shows a member their own team's memberships, so this answers honestly for the caller.
  const { data: membership } = await user
    .from('memberships')
    .select('role')
    .eq('team_id', body.teamId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (membership?.role !== 'head_coach') {
    throw new HttpError(403, 'Only the head coach manages billing')
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data: account, error } = await admin
    .rpc('billing_account_for_team', { p_team: body.teamId, p_owner: auth.user.id })
    .single<Account>()
  if (error || account == null) throw new HttpError(500, 'Could not load billing')

  const returnUrl = `${APP_URL}/team/billing`

  if (body.action === 'portal') {
    if (account.stripe_customer_id == null) throw new HttpError(409, 'No billing history yet')
    const portal = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: returnUrl,
    })
    return { url: portal.url }
  }

  if (body.plan !== 'team' && body.plan !== 'program') throw new HttpError(400, 'Unknown plan')
  if (account.status != null && ACTIVE.includes(account.status)) {
    throw new HttpError(409, 'This team already has a plan. Use Manage billing to change it.')
  }

  let customer = account.stripe_customer_id
  if (customer == null) {
    const created = await stripe.customers.create(
      { email: auth.user.email, metadata: { billing_account_id: account.id } },
      { idempotencyKey: `customer-${account.id}` },
    )
    customer = created.id
    await admin
      .from('billing_accounts')
      .update({ stripe_customer_id: customer })
      .eq('id', account.id)
      .is('stripe_customer_id', null)
  }

  const prices = await stripe.prices.list({ lookup_keys: [`${body.plan}_yearly`], active: true })
  const price = prices.data[0]
  if (price == null) throw new HttpError(500, `No active price for ${body.plan}_yearly`)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: account.id,
    subscription_data: { metadata: { billing_account_id: account.id, team_id: body.teamId } },
    allow_promotion_codes: true,
    success_url: `${returnUrl}?checkout=success`,
    cancel_url: `${returnUrl}?checkout=canceled`,
  })
  if (session.url == null) throw new HttpError(500, 'Checkout did not return a URL')
  return { url: session.url }
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: cors })
  try {
    return Response.json(await handle(req), { headers: cors })
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status, headers: cors })
    }
    console.error('billing failed', e)
    return Response.json({ error: 'Billing is unavailable' }, { status: 502, headers: cors })
  }
})
