-- Stripe webhook writes and the billing account a checkout starts from (issue #63, step 2).
-- Rollback (not applied by supabase db push): supabase/down/20261209000000_billing_webhook.sql
--
-- 1. public.billing_account_for_team: the billing-checkout Edge Function asks for the
--    team's billing account. If the team has none it creates one, owned by the caller,
--    and links the team. Calling it twice returns the same account.
-- 2. public.billing_apply_subscription: the stripe-webhook Edge Function hands it the
--    subscription state from one Stripe event. In one transaction it records the event id
--    (a repeat is a no-op), finds the account, skips an event older than the last one
--    applied (Stripe does not deliver in order), writes plan, status, period end and film
--    add-on blocks, and sets each linked team's film quota from its effective plan.
--    past_due_since is set when the subscription first goes past_due and cleared when it
--    leaves, so the 14-day grace in app.plan_of counts from the first failed payment.
-- 3. Both are service role only. Clients never call them.
-- Known gap until step 4: the quota follows the plan when an event arrives. When the
-- 14-day grace runs out with no further event, plan_of drops to Starter but the quota stays.

begin;

alter table public.billing_accounts add column stripe_event_at timestamptz;

create function public.billing_account_for_team(p_team uuid, p_owner uuid)
returns public.billing_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid;
  result public.billing_accounts;
begin
  select billing_account_id into account_id from public.teams where id = p_team for update;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  if account_id is null then
    insert into public.billing_accounts (owner_user_id) values (p_owner) returning id into account_id;
    update public.teams set billing_account_id = account_id where id = p_team;
  end if;
  select * into result from public.billing_accounts where id = account_id;
  return result;
end;
$$;

create function public.billing_apply_subscription(
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_account uuid,
  p_customer text,
  p_subscription text,
  p_plan text,
  p_status text,
  p_period_end timestamptz,
  p_film_blocks int
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct public.billing_accounts;
begin
  insert into public.stripe_events (id, type) values (p_event_id, p_event_type)
  on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  -- The account id rides in the subscription's metadata. Fall back to the Stripe ids.
  select * into acct from public.billing_accounts where id = p_account for update;
  if not found then
    select * into acct from public.billing_accounts
    where stripe_subscription_id = p_subscription for update;
  end if;
  if not found then
    select * into acct from public.billing_accounts
    where stripe_customer_id = p_customer for update;
  end if;
  if not found then
    return 'unknown_account';
  end if;

  if acct.stripe_event_at is not null and acct.stripe_event_at > p_event_at then
    return 'stale';
  end if;

  update public.billing_accounts set
    stripe_customer_id = coalesce(p_customer, stripe_customer_id),
    stripe_subscription_id = p_subscription,
    plan = p_plan,
    status = p_status,
    current_period_end = p_period_end,
    past_due_since = case
      when p_status = 'past_due' then coalesce(case when status = 'past_due' then past_due_since end, p_event_at)
    end,
    extra_film_blocks = p_film_blocks,
    stripe_event_at = p_event_at,
    updated_at = pg_catalog.now()
  where id = acct.id;

  -- Film: the effective plan's allowance, plus 50 GiB per add-on block on a paid plan.
  update public.teams tm set film_quota_bytes = p.film_bytes_per_team
    + case when p.id = 'starter' then 0 else p_film_blocks::bigint * 53687091200 end
  from public.plans p
  where tm.billing_account_id = acct.id and p.id = app.plan_of(tm.id);

  return 'applied';
end;
$$;

revoke all on function public.billing_account_for_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.billing_apply_subscription(
  text, text, timestamptz, uuid, text, text, text, text, timestamptz, int
) from public, anon, authenticated;
grant execute on function public.billing_account_for_team(uuid, uuid) to service_role;
grant execute on function public.billing_apply_subscription(
  text, text, timestamptz, uuid, text, text, text, text, timestamptz, int
) to service_role;

commit;
