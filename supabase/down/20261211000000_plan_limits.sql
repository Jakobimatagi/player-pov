-- Rollback for 20261211000000_plan_limits.sql: no limits, no manual plans. Grandfathered
-- accounts (manual, no Stripe customer) are removed and their teams unlinked.

begin;

drop trigger if exists plan_feature on public.activity_daily;
drop trigger if exists plan_feature on public.film;
drop trigger if exists plan_feature on public.depth_chart;
drop trigger if exists plan_feature on public.playbooks;
drop trigger if exists plan_feature on public.scout_reps;
drop trigger if exists plan_limit on public.invites;
drop trigger if exists plan_limit on public.memberships;
drop trigger if exists plan_limit on public.plays;

drop function if exists app.skip_without_activity();
drop function if exists app.require_feature();
drop function if exists app.limit_members();
drop function if exists app.limit_plays();
drop function if exists app.plan_limit(uuid, text, text);

update public.teams tm set billing_account_id = null
from public.billing_accounts ba
where ba.id = tm.billing_account_id and ba.manual_until is not null and ba.stripe_customer_id is null;
delete from public.billing_accounts where manual_until is not null and stripe_customer_id is null;

create or replace function app.plan_of(t uuid)
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

drop function if exists public.team_billing(uuid);
create function public.team_billing(p_team uuid)
returns table (
  plan text,
  max_coaches int,
  max_players int,
  max_plays int,
  features text[],
  coaches int,
  players int,
  plays int,
  film_used bigint,
  film_quota bigint,
  is_head_coach boolean,
  status text,
  renews_at timestamptz,
  past_due_since timestamptz,
  has_customer boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.max_coaches,
    p.max_players,
    p.max_plays,
    p.features,
    (select count(*)::int from public.memberships m
     where m.team_id = tm.id and m.role in ('head_coach', 'coach')),
    (select count(*)::int from public.memberships m
     where m.team_id = tm.id and m.role = 'player'),
    (select count(*)::int from public.plays pl
     where pl.team_id = tm.id and pl.archived_at is null),
    (select coalesce(sum(f.size_bytes), 0)::bigint from public.film f where f.team_id = tm.id),
    tm.film_quota_bytes,
    app.is_head_coach(tm.id),
    case when app.is_head_coach(tm.id) then ba.status end,
    case when app.is_head_coach(tm.id) then ba.current_period_end end,
    case when app.is_head_coach(tm.id) then ba.past_due_since end,
    case when app.is_head_coach(tm.id) then ba.stripe_customer_id is not null end
  from public.teams tm
  join public.plans p on p.id = app.plan_of(tm.id)
  left join public.billing_accounts ba on ba.id = tm.billing_account_id
  where tm.id = p_team and app.is_staff(tm.id)
$$;

revoke all on function public.team_billing(uuid) from public, anon;
grant execute on function public.team_billing(uuid) to authenticated, service_role;

alter table public.billing_accounts drop column if exists manual_until;

commit;
