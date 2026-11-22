-- Plans and billing accounts (issue #63, step 1: data, RLS, plan helpers).
-- Rollback (not applied by supabase db push): supabase/down/20261208000000_billing.sql
--
-- 1. plans: one row per plan with its limits and features. The limits live here and
--    nowhere else; prices live in Stripe. A null limit means unlimited.
-- 2. billing_accounts: one Stripe customer and subscription. The webhook (service role)
--    is the only writer. A team links to an account through teams.billing_account_id, so
--    one Program subscription covers up to plans.max_teams teams.
-- 3. A team's plan is derived, never stored on the team: app.plan_of reads the linked
--    account's plan and Stripe status. No account, a canceled subscription, or a payment
--    more than 14 days past due means Starter. Existing rows stay readable whatever the
--    plan; nothing in this step enforces a limit yet.
-- 4. stripe_events: ids of webhook events already handled, so a retried event is a no-op.
-- 5. Who sees what: the head coach of a linked team reads that billing account. Coaches,
--    players and other teams do not. Clients do not read plans directly yet; the billing
--    page (step 3) gets its team's limits from a member-scoped RPC. Nobody but the
--    service role writes plans, billing_accounts, stripe_events or teams.billing_account_id
--    (the teams update grant stays name, school, season, hash_rule, season_ends_on).

begin;

-- 1. Plans.
create table public.plans (
  id text primary key check (id in ('starter', 'team', 'program')),
  max_coaches int check (max_coaches is null or max_coaches > 0),
  max_players int check (max_players is null or max_players > 0),
  max_plays int check (max_plays is null or max_plays > 0),
  max_teams int not null check (max_teams > 0),
  film_bytes_per_team bigint not null check (film_bytes_per_team >= 0),
  features text[] not null
    check (features <@ array['homework', 'scout_packs', 'depth_chart', 'activity', 'film'])
);

insert into public.plans
  (id, max_coaches, max_players, max_plays, max_teams, film_bytes_per_team, features)
values
  ('starter', 1, 25, 15, 1, 0, array[]::text[]),
  ('team', null, null, null, 1, 10737418240,
   array['homework', 'scout_packs', 'depth_chart', 'activity', 'film']),
  ('program', null, null, null, 4, 10737418240,
   array['homework', 'scout_packs', 'depth_chart', 'activity', 'film']);

-- 2. Billing accounts.
create table public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users on delete set null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'starter' references public.plans,
  -- Stripe's subscription status. Null before the first checkout completes.
  status text check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled',
    'unpaid', 'paused'
  )),
  current_period_end timestamptz,
  -- When the subscription went past_due; the grace period counts from here.
  past_due_since timestamptz,
  -- Film add-on: 50 GiB per block, on top of the plan's film per team.
  extra_film_blocks int not null default 0 check (extra_film_blocks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'past_due') = (past_due_since is not null))
);

alter table public.teams
  add column billing_account_id uuid references public.billing_accounts on delete set null;

create index teams_billing_account_idx on public.teams (billing_account_id)
  where billing_account_id is not null;

-- 3. Plan helpers. Security definer so limit triggers in later steps can call them for
-- any caller; not granted to clients.
create function app.plan_of(t uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select ba.plan
    from public.teams tm
    join public.billing_accounts ba on ba.id = tm.billing_account_id
    where tm.id = t
      and (
        ba.status in ('active', 'trialing')
        or (ba.status = 'past_due' and ba.past_due_since > pg_catalog.now() - interval '14 days')
      )
  ), 'starter')
$$;

create function app.plan_allows(t uuid, feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select feature = any(p.features) from public.plans p where p.id = app.plan_of(t)), false)
$$;

-- The head coach of any team linked to the account.
create function app.can_view_billing(account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams tm
    where tm.billing_account_id = account and app.is_head_coach(tm.id)
  )
$$;

revoke all on function app.plan_of(uuid) from public, anon, authenticated;
revoke all on function app.plan_allows(uuid, text) from public, anon, authenticated;
revoke all on function app.can_view_billing(uuid) from public, anon;
grant execute on function app.plan_of(uuid) to service_role;
grant execute on function app.plan_allows(uuid, text) to service_role;
grant execute on function app.can_view_billing(uuid) to authenticated, service_role;

-- 4. Webhook idempotency.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- 5. RLS.
alter table public.plans enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.stripe_events enable row level security;

create policy billing_accounts_select on public.billing_accounts
  for select to authenticated
  using (app.can_view_billing(id));

revoke all on table public.plans from public, anon, authenticated;
grant all on table public.plans to service_role;

revoke all on table public.billing_accounts from public, anon, authenticated;
grant select on table public.billing_accounts to authenticated;
grant all on table public.billing_accounts to service_role;

revoke all on table public.stripe_events from public, anon, authenticated;
grant all on table public.stripe_events to service_role;

commit;
