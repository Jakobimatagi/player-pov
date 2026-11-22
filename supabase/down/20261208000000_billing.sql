-- Rollback for 20261208000000_billing.sql: no plans, no billing accounts, no webhook log.
-- Stripe customers and subscriptions are not touched; cancel them in the Stripe dashboard.

begin;

drop table if exists public.stripe_events;

drop function if exists app.plan_allows(uuid, text);
drop function if exists app.plan_of(uuid);

drop index if exists public.teams_billing_account_idx;
alter table public.teams drop column if exists billing_account_id;

-- The billing_accounts select policy depends on can_view_billing, so the table goes first.
drop table if exists public.billing_accounts;
drop function if exists app.can_view_billing(uuid);
drop table if exists public.plans;

commit;
