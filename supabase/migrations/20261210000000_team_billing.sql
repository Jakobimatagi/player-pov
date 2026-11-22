-- What the billing page shows (issue #63, step 3).
-- Rollback (not applied by supabase db push): supabase/down/20261210000000_team_billing.sql
--
-- public.team_billing(team) returns one row for staff on the team, nothing for anyone
-- else: the effective plan and its limits, what the team uses today (coaches, players,
-- live plays, film bytes) and the film quota. The payment fields (status, renewal, grace
-- start, whether a Stripe customer exists) are filled in for the head coach only, the
-- same people who can read billing_accounts. Players never see billing.

begin;

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

commit;
