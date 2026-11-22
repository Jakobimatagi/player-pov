-- Player study activity: a daily rollup per player, play, camera kind and watched slot.
-- Rollback (not applied by supabase db push): supabase/down/20261130000000_activity.sql
--
-- What is kept is in-app study only: seconds on a play sheet, seconds in the 3D viewer per
-- camera (only while the play is running), and how many runs of the play were started and
-- watched to the end. No device, location or per-click data. One row per
-- (team, player, day, play, kind, slot), upserted, so the table does not grow per heartbeat.
--
-- Writes go only through public.record_activity (security definer). It takes the caller
-- from auth.uid(), checks they are a player on the team who can view the play, and caps
-- each call. Players read their own rows; every coach on the team reads the team's rows.
-- Removing a member deletes their rows.
--
-- Rollout blocker: the consent statement (consent-v0-provisional) says nothing about
-- activity tracking. Whether it needs a new version and a re-consent step is unresolved;
-- see scenarios/activity.md.

begin;

create table public.activity_daily (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  play_id uuid not null references public.plays on delete cascade,
  kind text not null check (kind in ('playbook', 'pov', 'broadcast', 'topdown')),
  -- The play player id watched through, for POV. Empty for everything else.
  slot text not null default '' check (length(slot) <= 40),
  seconds int not null default 0 check (seconds between 0 and 86400),
  runs_started int not null default 0 check (runs_started >= 0),
  runs_completed int not null default 0 check (runs_completed >= 0),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id, day, play_id, kind, slot)
);

create index activity_daily_team_day_idx on public.activity_daily (team_id, day);
create index activity_daily_play_idx on public.activity_daily (play_id);

alter table public.activity_daily enable row level security;

-- Every coach on the team reads it. A player reads only their own rows.
create policy activity_select on public.activity_daily
  for select to authenticated
  using (app.is_staff(team_id) or (user_id = auth.uid() and app.is_member(team_id)));

-- No insert, update or delete policy and no write grant: record_activity is the only writer.
revoke all on table public.activity_daily from public, anon, authenticated;
grant select on table public.activity_daily to authenticated;
grant all on table public.activity_daily to service_role;

-- One heartbeat. Seconds are clamped to 120 per call and runs to 5, so a stuck or
-- hostile client cannot inflate a day. p_day is the player's local day, so it may be a
-- day either side of the server's.
create function public.record_activity(
  p_team uuid,
  p_play uuid,
  p_day date,
  p_kind text,
  p_slot text,
  p_seconds int,
  p_runs_started int default 0,
  p_runs_completed int default 0
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  play_team uuid;
  v_slot text := coalesce(p_slot, '');
  v_seconds int := least(coalesce(p_seconds, 0), 120);
  v_started int := least(coalesce(p_runs_started, 0), 5);
  v_completed int := least(coalesce(p_runs_completed, 0), 5);
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if app.my_role(p_team) is distinct from 'player'::public.team_role then
    raise exception 'only players on this team record activity' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('playbook', 'pov', 'broadcast', 'topdown') then
    raise exception 'unknown activity kind' using errcode = '22023';
  end if;
  if v_seconds < 0 or v_started < 0 or v_completed < 0 then
    raise exception 'activity cannot be negative' using errcode = '22023';
  end if;
  if length(v_slot) > 40 or (p_kind <> 'pov' and v_slot <> '') then
    raise exception 'slot is only recorded for POV' using errcode = '22023';
  end if;
  if p_kind = 'playbook' and (v_started > 0 or v_completed > 0) then
    raise exception 'runs are only recorded in the viewer' using errcode = '22023';
  end if;
  if p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'activity day must be today' using errcode = '22023';
  end if;
  select team_id into play_team from public.plays where id = p_play;
  if play_team is null or play_team is distinct from p_team or not app.can_view_play(p_play) then
    raise exception 'play is not on this team' using errcode = '42501';
  end if;
  if v_seconds = 0 and v_started = 0 and v_completed = 0 then
    return;
  end if;
  insert into public.activity_daily as a (
    team_id, user_id, day, play_id, kind, slot, seconds, runs_started, runs_completed
  ) values (
    p_team, uid, p_day, p_play, p_kind, v_slot, v_seconds, v_started, v_completed
  )
  on conflict (team_id, user_id, day, play_id, kind, slot) do update
    set seconds = least(a.seconds + excluded.seconds, 86400),
        runs_started = a.runs_started + excluded.runs_started,
        runs_completed = a.runs_completed + excluded.runs_completed,
        updated_at = pg_catalog.now();
end;
$$;

-- Per-player totals for a date range. Security invoker: RLS decides, so a coach gets the
-- whole team and a player gets their own row. Players with no activity have no row.
create function public.activity_summary(p_team uuid, p_from date, p_to date)
returns table (
  user_id uuid,
  playbook_seconds int,
  pov_seconds int,
  broadcast_seconds int,
  topdown_seconds int,
  pov_reps int,
  own_slot_reps int,
  runs_started int,
  plays_opened int,
  days_active int,
  last_day date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.user_id,
    coalesce(sum(a.seconds) filter (where a.kind = 'playbook'), 0)::int,
    coalesce(sum(a.seconds) filter (where a.kind = 'pov'), 0)::int,
    coalesce(sum(a.seconds) filter (where a.kind = 'broadcast'), 0)::int,
    coalesce(sum(a.seconds) filter (where a.kind = 'topdown'), 0)::int,
    coalesce(sum(a.runs_completed) filter (where a.kind = 'pov'), 0)::int,
    coalesce(sum(a.runs_completed) filter (
      where a.kind = 'pov'
        and exists (
          select 1 from public.player_slots ps
          where ps.play_id = a.play_id and ps.user_id = a.user_id and ps.slot = a.slot
        )
    ), 0)::int,
    coalesce(sum(a.runs_started), 0)::int,
    count(distinct a.play_id)::int,
    count(distinct a.day)::int,
    (select max(b.day) from public.activity_daily b
      where b.team_id = p_team and b.user_id = a.user_id)
  from public.activity_daily a
  where a.team_id = p_team
    and a.day between p_from and p_to
    and app.is_member(p_team)
  group by a.user_id
$$;

-- Each assigned player's progress on each playbook assignment: published plays in the
-- folder and its subfolders, how many they opened, and how many they watched in POV to the
-- end, counting activity since the day before the assignment was made. Security invoker.
create function public.assignment_progress(p_team uuid)
returns table (
  assignment_id uuid,
  playbook_id uuid,
  playbook_name text,
  due_at timestamptz,
  user_id uuid,
  plays_total int,
  plays_opened int,
  plays_repped int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive targets as (
    select at.assignment_id, at.user_id, at.playbook_id, at.due_at, a.created_at
    from public.assignment_targets at
    join public.assignments a on a.id = at.assignment_id
    where at.team_id = p_team
      and at.playbook_id is not null
      and app.is_member(p_team)
  ),
  tree(assignment_id, book_id, level) as (
    select distinct t.assignment_id, t.playbook_id, 1 from targets t
    union all
    select tree.assignment_id, pb.id, tree.level + 1
    from public.playbooks pb
    join tree on pb.parent_id = tree.book_id
    where pb.archived_at is null and tree.level < 16
  ),
  book_plays as (
    select distinct tree.assignment_id, pp.play_id
    from tree
    join public.playbook_plays pp on pp.playbook_id = tree.book_id
    join public.plays pl on pl.id = pp.play_id
    where pl.archived_at is null and pl.published_at is not null
  )
  select
    t.assignment_id,
    t.playbook_id,
    pb.name,
    t.due_at,
    t.user_id,
    (select count(*) from book_plays bp where bp.assignment_id = t.assignment_id)::int,
    (select count(distinct bp.play_id)
       from book_plays bp
       join public.activity_daily ad
         on ad.play_id = bp.play_id
        and ad.team_id = p_team
        and ad.user_id = t.user_id
        and ad.day >= (t.created_at at time zone 'utc')::date - 1
      where bp.assignment_id = t.assignment_id)::int,
    (select count(distinct bp.play_id)
       from book_plays bp
       join public.activity_daily ad
         on ad.play_id = bp.play_id
        and ad.team_id = p_team
        and ad.user_id = t.user_id
        and ad.kind = 'pov'
        and ad.runs_completed > 0
        and ad.day >= (t.created_at at time zone 'utc')::date - 1
      where bp.assignment_id = t.assignment_id)::int
  from targets t
  join public.playbooks pb on pb.id = t.playbook_id and pb.archived_at is null
$$;

-- Removing a member (delete_member_data, remove_member, or a direct delete) takes their
-- activity on that team with it.
create function app.clear_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.activity_daily where team_id = old.team_id and user_id = old.user_id;
  return old;
end;
$$;

create trigger memberships_clear_activity
  after delete on public.memberships
  for each row execute function app.clear_member_activity();

revoke all on function app.clear_member_activity() from public, anon, authenticated, service_role;
revoke all on function public.record_activity(uuid, uuid, date, text, text, int, int, int)
  from public, anon;
revoke all on function public.activity_summary(uuid, date, date) from public, anon;
revoke all on function public.assignment_progress(uuid) from public, anon;
grant execute on function public.record_activity(uuid, uuid, date, text, text, int, int, int)
  to authenticated, service_role;
grant execute on function public.activity_summary(uuid, date, date) to authenticated, service_role;
grant execute on function public.assignment_progress(uuid) to authenticated, service_role;

commit;
