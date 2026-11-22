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

The **Billing** tab (`/team/billing`, `src/team/BillingPage.tsx`) shows the plan, usage against its limits, and Upgrade or Manage billing for the head coach. It reads `public.team_billing(team)` (`supabase/migrations/20261210000000_team_billing.sql`, checked by `supabase/tests/team_billing.test.sql`): staff get the plan and usage, only the head coach gets payment status and renewal, players get nothing.

## How it fits together

1. The head coach asks `billing` for a Checkout URL. The function checks the caller is the team's head coach (403 otherwise), gets or creates the team's billing account, creates the Stripe customer once, finds the price by lookup key (`team_yearly`, `program_yearly`) and returns the Checkout URL. The billing account id goes into the subscription's metadata.
2. Stripe sends `customer.subscription.created`, `.updated`, `.deleted`, `.paused` and `.resumed`. Each carries the whole subscription. `stripe-webhook` checks the signature, maps the subscription to plan, status, period end and film add-on blocks, and calls `public.billing_apply_subscription`.
3. That function records the event id (a retry returns `duplicate`), skips an event older than the last one applied (`stale`), writes the account, and sets each linked team's `film_quota_bytes` from its effective plan.
4. `app.plan_of(team)` is the answer everywhere: active or trialing is the paid plan, past_due keeps it for 14 days from the first failed payment, anything else is Starter.

Nothing in the browser can change a plan. Clients have no write grant on `billing_accounts` and cannot call either billing function in the database.

## Checkout switch

Paid plans are off until launch. With the switch off, the Billing tab shows **Coming soon** in place of the Upgrade buttons, and the `billing` function answers a checkout request with 503 `Paid plans are coming soon`. Manage billing (the portal) still works for any team that already has a Stripe customer.

To turn checkout on, set both, then redeploy the site:

- Vercel: `VITE_CHECKOUT_ENABLED=true` (the build reads it).
- Supabase: `supabase secrets set --project-ref bfaopibbbldsxvjprfdx CHECKOUT_ENABLED=true`.

Any other value, or no value, keeps checkout off.

## Setup (test mode)

Do this in the Stripe sandbox **Player POV** first. Live mode repeats it after the live account is activated.

1. Stripe Dashboard (sandbox) → **Developers → API keys**: copy the secret key (`sk_test_…`).
2. **Settings → Billing → Customer portal**: click **Save** once so a default portal configuration exists. Allow cancel and payment method updates.
3. Add to `supabase/functions/.env` (not committed):

   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   APP_URL=http://localhost:5173
   CHECKOUT_ENABLED=true
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

## Scenario 5 — Billing tab

**Preconditions:** Signed in as `coach@demo.local` with the local stack and functions served, `VITE_CHECKOUT_ENABLED=true` in `.env.local` and `CHECKOUT_ENABLED=true` in `supabase/functions/.env`.

**Steps:**

1. Open **Team → Billing** on a Starter team.
2. Click **Upgrade to Team**, then use Stripe's back arrow.
3. After scenario 2, open **Team → Billing** again and click **Manage billing**.
4. Sign in as `player@demo.local` and open `/team/billing`.

**Expected:**

- Starter shows `Coaches 1 of 1`, `Players n of 25`, `Plays n of 15`, `Game film Not included`, and two upgrade cards ($499 and $899 a year).
- Upgrade opens Stripe Checkout for that plan. Coming back with the back arrow shows `Checkout canceled. Nothing was charged.`
- Returning from a payment shows `Payment received. Updating your plan…` until the webhook lands, then `You’re all set. Your new plan is active.` If the webhook takes more than 30 seconds: `Your plan can take a minute to update. Refresh this page soon.`
- A paid team shows the plan, `Renews <date>`, unlimited counts, film used of 10 GB, and **Manage billing**, which opens the Stripe portal. No upgrade cards.
- A failed payment shows `Payment failed. Update your card by <date> to keep your plan.` with the date 14 days after the first failure.
- An assistant coach sees the plan and usage, no buttons, and `Ask your head coach to upgrade.`
- The player is sent to `/team` and sees no billing anywhere.
- At 390 px there is no sideways scroll.
- With `VITE_CHECKOUT_ENABLED` unset, both cards show a disabled **Coming soon** button and `Paid plans are coming soon. Your team keeps everything it has today in the meantime.` A checkout POST to the function without `CHECKOUT_ENABLED=true` returns 503 `Paid plans are coming soon`.

## Starter limits

`supabase/migrations/20261211000000_plan_limits.sql`, checked by `supabase/tests/plan_limits.test.sql`. The database refuses, so no client can get around them.

| Limit         | Where it is checked                                       | Message (head coach)                                                                         |
| ------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 15 live plays | new play, or an archived play brought back                | `Your plan includes up to 15 plays. Archive one or upgrade. Open Team → Billing to upgrade.` |
| 1 coach       | new membership or role change; new coach invite           | `Your plan includes 1 coach. Open Team → Billing to upgrade.`                                |
| 25 players    | new membership; new player invite (pending invites count) | `Your plan includes up to 25 players. Open Team → Billing to upgrade.`                       |
| Rep homework  | new `scout_reps` row                                      | `Rep homework is not included in your plan. …`                                               |
| Scout packs   | new pack week folder                                      | `Scout packs are not included in your plan. …`                                               |
| Depth chart   | any depth chart change                                    | `The depth chart is not included in your plan. …`                                            |
| Game film     | new film                                                  | `Game film is not included in your plan. …`                                                  |
| Activity      | recorded in the background                                | Not recorded. The player sees no error.                                                      |

Anyone other than the head coach reads `… Ask your head coach to upgrade.` instead. Every refusal has SQLSTATE `PLAN1` and the limit in the error hint (`plays`, `players`, `coaches`, `feature:film`, …), so a later screen can link straight to Billing.

Assigning plays to players works on every plan: it is how Starter players see their plays in 3D.

After a downgrade nothing is deleted. Plays, film, members and homework stay readable and existing plays stay editable. Only new things past a limit are refused.

**Grandfathered teams.** Every team that existed when this migration ran got a manual Team plan until Aug 1, 2027 (`billing_accounts.manual_until`). The Billing tab shows `Included until Aug 1, 2027`. Extend or end one by hand:

```sql
update public.billing_accounts set manual_until = '2027-12-31 12:00+00'
where id = (select billing_account_id from public.teams where name = 'Team name');
```

The same column covers a school that pays by invoice: create an account with `plan` and `manual_until`, and link the team.

## Scenario 6 — Limits on a Starter team

**Preconditions:** A team with no billing account (or one whose manual plan has ended), signed in as its head coach.

**Steps:**

1. Team → Invite, role Coach, any name and email, **Send invite**.
2. Game film → add a film.

**Expected:**

- The invite form shows `Your plan includes 1 coach. Open Team → Billing to upgrade.` No invite is created and no email goes out.
- Adding film shows `Game film is not included in your plan. Open Team → Billing to upgrade.` before any upload starts.

## Not in this step

- A link button in the limit messages. Today the message names Team → Billing in words.
- The Program plan's 4 teams versus `create_team`'s cap of 3 teams per user (issue #63 open question 2).
- An invoice or purchase-order path for schools. Handle by hand in Stripe Invoicing for now.
- Linking more teams to a Program account. Checkout links only the team it started from.
- When the 14-day grace runs out with no new event, `plan_of` turns to Starter and new film is refused, but `film_quota_bytes` still shows the old quota on the film page.
- Stripe Tax, the founding coupon and trials (`marketing/pricing.md` section 4). Checkout already allows promotion codes.
