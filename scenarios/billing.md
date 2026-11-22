# Billing (Stripe)

A head coach pays for a team through Stripe Checkout. Stripe tells the app what happened through a webhook, and the database works out each team's plan (issue #63).

| Piece                     | Where                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Plans, accounts, RLS      | `supabase/migrations/20261208000000_billing.sql`, checked by `supabase/tests/billing.test.sql`                 |
| Webhook writes            | `supabase/migrations/20261209000000_billing_webhook.sql`, checked by `supabase/tests/billing_webhook.test.sql` |
| Checkout and portal       | Edge Function `supabase/functions/billing` (`action: 'checkout'` or `'portal'`)                                |
| Webhook                   | Edge Function `supabase/functions/stripe-webhook`, `verify_jwt = false` in `supabase/config.toml`              |
| Subscription → state      | `supabase/functions/stripe-webhook/subscription.ts`, checked by `tests/stripe-subscription.test.ts`            |
| Products, prices, account | `marketing/pricing.md` section 4                                                                               |

The billing page (`/team/billing`) is step 3 and does not exist yet. Checkout and the portal already send the coach back there.

## How it fits together

1. The head coach asks `billing` for a Checkout URL. The function checks the caller is the team's head coach (403 otherwise), gets or creates the team's billing account, creates the Stripe customer once, finds the price by lookup key (`team_yearly`, `program_yearly`) and returns the Checkout URL. The billing account id goes into the subscription's metadata.
2. Stripe sends `customer.subscription.created`, `.updated`, `.deleted`, `.paused` and `.resumed`. Each carries the whole subscription. `stripe-webhook` checks the signature, maps the subscription to plan, status, period end and film add-on blocks, and calls `public.billing_apply_subscription`.
3. That function records the event id (a retry returns `duplicate`), skips an event older than the last one applied (`stale`), writes the account, and sets each linked team's `film_quota_bytes` from its effective plan.
4. `app.plan_of(team)` is the answer everywhere: active or trialing is the paid plan, past_due keeps it for 14 days from the first failed payment, anything else is Starter.

Nothing in the browser can change a plan. Clients have no write grant on `billing_accounts` and cannot call either billing function in the database.

## Setup (test mode)

Do this in the Stripe sandbox **Player POV** first. Live mode repeats it after the live account is activated.

1. Stripe Dashboard (sandbox) → **Developers → API keys**: copy the secret key (`sk_test_…`).
2. **Settings → Billing → Customer portal**: click **Save** once so a default portal configuration exists. Allow cancel and payment method updates.
3. Add to `supabase/functions/.env` (not committed):

   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   APP_URL=http://localhost:5173
   ```

4. Local webhook: install the Stripe CLI, then forward events and copy the `whsec_…` it prints into the file above:

   ```bash
   stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
   ```

   ```bash
   supabase functions serve --env-file supabase/functions/.env
   ```

5. Hosted: **Developers → Webhooks → Add endpoint** with URL `https://bfaopibbbldsxvjprfdx.supabase.co/functions/v1/stripe-webhook` and the five `customer.subscription.*` events above. Put its signing secret in `STRIPE_WEBHOOK_SECRET`, set `APP_URL` to the production URL, then:

   ```bash
   supabase secrets set --project-ref bfaopibbbldsxvjprfdx --env-file supabase/functions/.env
   ```

   ```bash
   supabase functions deploy billing --project-ref bfaopibbbldsxvjprfdx
   ```

   ```bash
   supabase functions deploy stripe-webhook --project-ref bfaopibbbldsxvjprfdx --no-verify-jwt
   ```

The Stripe keys live in Supabase only, never in Vercel or the browser build.

## Scenario 1 — Only the head coach gets a Checkout URL

**Preconditions:** Local stack with `supabase/seed.sql`. Functions served as in setup step 4.

**Steps:**

1. As `player@demo.local`, POST `{"action":"checkout","teamId":"00000000-0000-4000-8000-0000000000a1","plan":"team"}` to `/functions/v1/billing`.
2. Same as `coach@demo.local`.

**Expected:**

- The player gets 403 `Only the head coach manages billing`. So does any assistant coach.
- The head coach gets `{ "url": "https://checkout.stripe.com/..." }`. The team now has a billing account with a Stripe customer.
- With no token the gateway returns 401.

## Scenario 2 — Pay in test mode

**Steps:**

1. Open the URL from scenario 1 and pay with card `4242 4242 4242 4242`, any future date, any CVC.

**Expected:**

- Stripe redirects to `/team/billing?checkout=success`.
- `stripe listen` shows `customer.subscription.created` → 200 `{"result":"applied"}`.
- `select app.plan_of('00000000-0000-4000-8000-0000000000a1')` is `team`, and the team's `film_quota_bytes` is 10737418240.
- Asking for another Checkout URL now returns 409 `This team already has a plan. Use Manage billing to change it.`

## Scenario 3 — Portal and cancel

**Steps:**

1. As the head coach, POST `{"action":"portal","teamId":"…"}` and open the URL.
2. Cancel the plan immediately in the portal.

**Expected:**

- Before any checkout, the portal returns 409 `No billing history yet`.
- After cancel, `customer.subscription.deleted` is applied, `app.plan_of` is `starter` and `film_quota_bytes` is 0. Film already uploaded stays readable.

## Scenario 4 — Signatures, retries and order

**Steps:**

1. POST an event with no `Stripe-Signature`, then one signed with the wrong secret.
2. Run `stripe events resend <event id>` for an applied event.
3. `stripe trigger invoice.paid`.

**Expected:**

- Both unsigned and wrongly signed events get 400 and change nothing.
- A resent event returns `{"result":"duplicate"}`.
- Event types outside `customer.subscription.*` return `{"result":"ignored"}`.

## Not in this step

- The billing page and upgrade prompts (step 3), and Starter limits (step 4).
- Linking more teams to a Program account. Checkout links only the team it started from.
- When the 14-day grace runs out with no new event, `plan_of` turns to Starter but `film_quota_bytes` stays until the next event. Step 4 enforces limits from `plan_of`.
- Stripe Tax, the founding coupon and trials (`marketing/pricing.md` section 4). Checkout already allows promotion codes.
