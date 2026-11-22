-- Starter limits, enforced in the database (issue #63, step 4).
-- Rollback (not applied by supabase db push): supabase/down/20261211000000_plan_limits.sql
--
-- 1. billing_accounts.manual_until: a paid plan set by hand, with no Stripe subscription.
--    Used for teams that existed before billing (grandfathered below) and for schools that
--    pay by invoice. app.plan_of counts it like an active subscription until that time.
-- 2. Grandfathering: every team without a billing account gets one on Team until
--    2027-08-01, so nothing changes for teams that signed up before plans existed.
-- 3. Limits, read from public.plans for the team's effective plan (app.plan_of):
--    - plays: a new or unarchived live play past max_plays
--    - players and coaches: a membership or a pending invite past max_players / max_coaches
--    - features: rep homework (scout_reps), scout packs (playbooks with a pack week), the
--      depth chart and game film need the feature on the plan. Activity is not recorded on
--      a plan without it; the player sees no error.
--    Assigning plays to players stays on every plan: it is how Starter players see plays.
--    Rows that exist already stay readable and editable after a downgrade, except the
--    depth chart and new film. Nothing is deleted.
-- 4. The triggers are named plan_limit and plan_feature so they fire before each table's
--    <table>_guard trigger (Postgres runs BEFORE triggers in name order): a Starter team
--    hears about its plan before any validation detail.
-- 5. Every refusal has SQLSTATE PLAN1, a message the app shows as is, and the limit in
--    HINT (plays, players, coaches, feature:<name>). The message tells the head coach to
--    open Billing and everyone else to ask the head coach.
-- 6. team_billing also returns manual_until (head coach only), so the Billing tab can say
--    how long a manual plan lasts.

begin;

-- 1. Manual plans.
alter table public.billing_accounts add column manual_until timestamptz;

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
        or ba.manual_until > pg_catalog.now()
      )
  ), 'starter')
$$;

-- 2. Grandfather every team that exists today.
do $$
declare
  r record;
  account uuid;
begin
  for r in select id, created_by from public.teams where billing_account_id is null loop
    insert into public.billing_accounts (owner_user_id, plan, manual_until)
    values (r.created_by, 'team', '2027-08-01 12:00+00')
    returning id into account;
    update public.teams set billing_account_id = account where id = r.id;
  end loop;
end $$;

-- 3. Refusals.
create function app.plan_limit(t uuid, what text, detail text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  raise exception '%', detail || case
    when app.is_head_coach(t) then ' Open Team → Billing to upgrade.'
    else ' Ask your head coach to upgrade.'
  end
    using errcode = 'PLAN1', hint = what;
end;
$$;

-- A new live play, or an archived one brought back.
create function app.limit_plays()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap int;
  live int;
begin
  if new.archived_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.archived_at is null then return new; end if;
  select max_plays into cap from public.plans where id = app.plan_of(new.team_id);
  if cap is null then return new; end if;
  select count(*) into live from public.plays
  where team_id = new.team_id and archived_at is null and id <> new.id;
  if live >= cap then
    perform app.plan_limit(new.team_id, 'plays',
      format('Your plan includes up to %s plays. Archive one or upgrade.', cap));
  end if;
  return new;
end;
$$;

create trigger plan_limit
  before insert or update of archived_at on public.plays
  for each row execute function app.limit_plays();

-- Coaches (head coach and coach) and players are capped separately. Pending invites
-- count, so an invite is refused up front rather than when it is accepted.
create function app.limit_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff boolean := new.role in ('head_coach', 'coach');
  cap int;
  used int;
begin
  if tg_table_name = 'memberships' and tg_op = 'UPDATE'
     and (old.role in ('head_coach', 'coach')) = staff then
    return new;
  end if;
  select case when staff then max_coaches else max_players end into cap
  from public.plans where id = app.plan_of(new.team_id);
  if cap is null then return new; end if;

  select count(*) into used from public.memberships m
  where m.team_id = new.team_id
    and (m.role in ('head_coach', 'coach')) = staff
    -- invites has no user_id; for a membership, leave out the row being changed.
    and m.user_id is distinct from (to_jsonb(new) ->> 'user_id')::uuid;
  -- A new invite also counts the invites still waiting to be accepted.
  if tg_table_name = 'invites' then
    select used + count(*) into used from public.invites i
    where i.team_id = new.team_id
      and (i.role in ('head_coach', 'coach')) = staff
      and i.accepted_at is null
      and i.expires_at > pg_catalog.now();
  end if;

  if used >= cap then
    perform app.plan_limit(new.team_id, case when staff then 'coaches' else 'players' end,
      case when staff
        then format('Your plan includes %s coach%s.', cap, case when cap = 1 then '' else 'es' end)
        else format('Your plan includes up to %s players.', cap)
      end);
  end if;
  return new;
end;
$$;

create trigger plan_limit
  before insert or update of role on public.memberships
  for each row execute function app.limit_members();

create trigger plan_limit
  before insert on public.invites
  for each row execute function app.limit_members();

-- A feature the plan does not include. TG_ARGV[0] is the feature.
create function app.require_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  feature text := tg_argv[0];
begin
  if app.plan_allows(new.team_id, feature) then return new; end if;
  perform app.plan_limit(new.team_id, 'feature:' || feature,
    case feature
      when 'homework' then 'Rep homework is not included in your plan.'
      when 'scout_packs' then 'Scout packs are not included in your plan.'
      when 'depth_chart' then 'The depth chart is not included in your plan.'
      when 'film' then 'Game film is not included in your plan.'
      else 'This is not included in your plan.'
    end);
  return new;
end;
$$;

create trigger plan_feature
  before insert on public.scout_reps
  for each row execute function app.require_feature('homework');

create trigger plan_feature
  before insert on public.playbooks
  for each row when (new.pack_week is not null)
  execute function app.require_feature('scout_packs');

create trigger plan_feature
  before insert or update on public.depth_chart
  for each row execute function app.require_feature('depth_chart');

create trigger plan_feature
  before insert on public.film
  for each row execute function app.require_feature('film');

-- Activity is recorded from the player's app in the background. Without the feature the
-- row is skipped, not refused, so the player never sees an error.
create function app.skip_without_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.plan_allows(new.team_id, 'activity') then return new; end if;
  return null;
end;
$$;

create trigger plan_feature
  before insert on public.activity_daily
  for each row execute function app.skip_without_activity();

revoke all on function app.plan_limit(uuid, text, text) from public, anon, authenticated;
revoke all on function app.limit_plays() from public, anon, authenticated;
revoke all on function app.limit_members() from public, anon, authenticated;
revoke all on function app.require_feature() from public, anon, authenticated;
revoke all on function app.skip_without_activity() from public, anon, authenticated;

-- 4. The billing page shows a manual plan's end date to the head coach.
drop function public.team_billing(uuid);
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
  has_customer boolean,
  manual_until timestamptz
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
    case when app.is_head_coach(tm.id) then ba.stripe_customer_id is not null end,
    case when app.is_head_coach(tm.id) then ba.manual_until end
  from public.teams tm
  join public.plans p on p.id = app.plan_of(tm.id)
  left join public.billing_accounts ba on ba.id = tm.billing_account_id
  where tm.id = p_team and app.is_staff(tm.id)
$$;

revoke all on function public.team_billing(uuid) from public, anon;
grant execute on function public.team_billing(uuid) to authenticated, service_role;

commit;
