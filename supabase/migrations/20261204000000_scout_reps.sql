-- Scout rep homework (issue #44): a coach marks where one position should end up on a
-- play against one scout look, assigns it with a due date, and sees who got it right.
-- Rollback (not applied by supabase db push): supabase/down/20261204000000_scout_reps.sql
--
-- 1. scout_reps: one (play, look, slot) with a target spot and a tolerance circle.
--    target_x / target_y are yards from the ball at the snap, like the editor's legs:
--    x downfield for the offense, y toward the offense's left sideline. Staff only: a
--    player never reads this table, so the target can't leak through the API.
-- 2. assignments.rep_id: a third assignment target. Exactly one of playbook_id,
--    package_id, rep_id. A rep's side is its play's side, and assigning it follows the
--    playbook rules (head coach, that side's coordinator, or a coach with no side).
--    A rep can only be assigned while its play is published, and only to players who can
--    already read its look (the play's own look, or a look in a package assigned to them).
-- 3. A rep assignment lets its players open the play (app.can_view_play), like a playbook
--    assignment does, while the play stays published.
-- 4. rep_attempts: every try. Written only by submit_rep_attempt, which computes the
--    distance and pass on the server. Players read their own rows, staff the team's.
-- 5. my_rep_homework: a player's reps. The target, tolerance and coaching note stay null
--    until the player has made an attempt.
-- 6. rep_results: per player per rep for coaches: attempts, first try, best, passed.

begin;

-- 1. Reps.
create table public.scout_reps (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  play_id uuid not null references public.plays on delete cascade,
  look_id uuid not null,
  slot text not null check (slot ~ '^[a-z][a-z0-9_]*$' and length(slot) <= 40),
  target_x double precision not null check (target_x between -120 and 120),
  target_y double precision not null check (target_y between -60 and 60),
  tolerance_yd double precision not null default 2 check (tolerance_yd between 1 and 10),
  note text check (length(note) <= 280),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scout_reps_look_team_fkey
    foreign key (team_id, look_id) references public.scout_looks (team_id, id) on delete cascade,
  constraint scout_reps_play_look_slot_key unique (play_id, look_id, slot)
);

create index scout_reps_team_idx on public.scout_reps (team_id);

-- The side a rep belongs to: its play's side.
create function app.play_side(p uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select side from public.plays where id = p
$$;

create function app.rep_side(r uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pl.side from public.scout_reps sr join public.plays pl on pl.id = sr.play_id where sr.id = r
$$;

revoke all on function app.play_side(uuid) from public, anon;
revoke all on function app.rep_side(uuid) from public, anon;
grant execute on function app.play_side(uuid) to authenticated, service_role;
grant execute on function app.rep_side(uuid) to authenticated, service_role;

-- Same team for the play, a look from the other side of the ball, and a slot that is one
-- of the play's own positions in its current version. The ids are fixed after insert.
create function app.guard_scout_rep()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_play_team uuid;
  v_play_side text;
  v_look_side text;
begin
  if tg_op = 'UPDATE' and (
    new.team_id is distinct from old.team_id
    or new.play_id is distinct from old.play_id
    or new.look_id is distinct from old.look_id
    or new.slot is distinct from old.slot
  ) then
    raise exception 'a rep''s play, look and slot are fixed. Make a new rep instead'
      using errcode = '23514';
  end if;
  select team_id, side into v_play_team, v_play_side from public.plays where id = new.play_id;
  if v_play_team is null or v_play_team is distinct from new.team_id then
    raise exception 'play is not on this team' using errcode = '23514';
  end if;
  select side into v_look_side
  from public.scout_looks where id = new.look_id and team_id = new.team_id;
  if v_look_side is null then
    raise exception 'look is not on this team' using errcode = '23514';
  end if;
  if v_look_side = v_play_side then
    raise exception 'a rep is run against a look from the other side of the ball'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1
    from public.plays pl
    join public.play_versions pv on pv.play_id = pl.id and pv.version = pl.current_version
    cross join lateral jsonb_array_elements(coalesce(pv.compiled -> 'players', '[]'::jsonb)) pj
    where pl.id = new.play_id and pj ->> 'id' = new.slot and pj ->> 'team' = pl.side
  ) then
    raise exception 'that position is not on this play' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger scout_reps_guard
  before insert or update on public.scout_reps
  for each row execute function app.guard_scout_rep();

create trigger scout_reps_touch_updated_at
  before update on public.scout_reps
  for each row execute function app.touch_play_updated_at();

revoke all on function app.guard_scout_rep() from public, anon, authenticated, service_role;

alter table public.scout_reps enable row level security;

create policy reps_select on public.scout_reps
  for select to authenticated
  using (app.is_staff(team_id));
create policy reps_insert on public.scout_reps
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and created_by = auth.uid()
    and app.can_edit_side(team_id, app.play_side(play_id))
  );
create policy reps_update on public.scout_reps
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.play_side(play_id)))
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, app.play_side(play_id)));
create policy reps_delete on public.scout_reps
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.play_side(play_id)));

revoke all on table public.scout_reps from public, anon, authenticated;
grant select, insert, delete on table public.scout_reps to authenticated;
grant update (target_x, target_y, tolerance_yd, note) on table public.scout_reps to authenticated;
grant all on table public.scout_reps to service_role;

-- 2. assignments.rep_id.
alter table public.assignments
  add column rep_id uuid references public.scout_reps on delete cascade;
alter table public.assignments drop constraint assignments_playbook_or_package;
alter table public.assignments
  add constraint assignments_one_target check (num_nonnulls(playbook_id, package_id, rep_id) = 1);

-- One assignment per rep per player or group.
create unique index assignments_rep_user_key
  on public.assignments (rep_id, assignee_user)
  where rep_id is not null and assignee_user is not null;
create unique index assignments_rep_group_key
  on public.assignments (rep_id, assignee_group)
  where rep_id is not null and assignee_group is not null;

-- Can these assignees read this look? The play's own look comes with the play (the rep
-- assignment opens it). Any other look needs a scout package that holds it, assigned to
-- the same player (directly or through their group) or to the same group.
create function app.rep_look_reaches(
  t uuid,
  l uuid,
  p uuid,
  u uuid,
  g public.position_group
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plays pl where pl.id = p and pl.team_id = t and pl.default_look_id = l
  )
  or exists (
    select 1
    from public.assignments a
    join public.scout_package_looks spl on spl.package_id = a.package_id
    where a.team_id = t
      and a.package_id is not null
      and spl.look_id = l
      and (
        (g is not null and a.assignee_group = g)
        or (
          u is not null
          and (
            a.assignee_user = u
            or a.assignee_group = (
              select public.position_group_of(m.position)
              from public.memberships m
              where m.team_id = t and m.user_id = u
            )
          )
        )
      )
  )
$$;

revoke all on function app.rep_look_reaches(uuid, uuid, uuid, uuid, public.position_group)
  from public, anon, authenticated;
grant execute on function app.rep_look_reaches(uuid, uuid, uuid, uuid, public.position_group)
  to service_role;

create or replace function app.guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_team uuid;
  member_role public.team_role;
  v_play uuid;
  v_look uuid;
  v_published timestamptz;
  v_archived timestamptz;
begin
  if new.assignee_user is not null then
    select role into member_role
    from public.memberships
    where team_id = new.team_id and user_id = new.assignee_user;
    if member_role is distinct from 'player'::public.team_role then
      raise exception 'assignee must be a player on this team' using errcode = '23514';
    end if;
  end if;
  if new.playbook_id is not null then
    select team_id into target_team from public.playbooks where id = new.playbook_id;
    if target_team is null or target_team is distinct from new.team_id then
      raise exception 'playbook is not on this team' using errcode = '23514';
    end if;
  elsif new.package_id is not null then
    select team_id into target_team from public.scout_packages where id = new.package_id;
    if target_team is null or target_team is distinct from new.team_id then
      raise exception 'package is not on this team' using errcode = '23514';
    end if;
  elsif new.rep_id is not null then
    select team_id, play_id, look_id into target_team, v_play, v_look
    from public.scout_reps where id = new.rep_id;
    if target_team is null or target_team is distinct from new.team_id then
      raise exception 'rep is not on this team' using errcode = '23514';
    end if;
    -- Re-checked only when who or what is assigned changes, so a coach can still move
    -- the due date after the play goes back to Draft.
    if tg_op = 'INSERT'
       or new.rep_id is distinct from old.rep_id
       or new.assignee_user is distinct from old.assignee_user
       or new.assignee_group is distinct from old.assignee_group then
      select published_at, archived_at into v_published, v_archived
      from public.plays where id = v_play;
      if v_published is null or v_archived is not null then
        raise exception 'publish the play before assigning this rep' using errcode = '23514';
      end if;
      if not app.rep_look_reaches(
        new.team_id, v_look, v_play, new.assignee_user, new.assignee_group
      ) then
        raise exception 'these players can''t see this look yet. Assign them a scout package with it first'
          using errcode = '23514';
      end if;
    end if;
  else
    raise exception 'assignment needs a playbook, a package or a rep' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop policy asg_insert on public.assignments;
drop policy asg_update on public.assignments;
drop policy asg_delete on public.assignments;

create policy asg_insert on public.assignments
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and created_by = auth.uid()
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
    and (rep_id is null or app.can_edit_side(team_id, app.rep_side(rep_id)))
  );
create policy asg_update on public.assignments
  for update to authenticated
  using (
    app.is_staff(team_id)
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
    and (rep_id is null or app.can_edit_side(team_id, app.rep_side(rep_id)))
  )
  with check (
    app.is_staff(team_id)
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
    and (rep_id is null or app.can_edit_side(team_id, app.rep_side(rep_id)))
  );
create policy asg_delete on public.assignments
  for delete to authenticated
  using (
    app.is_staff(team_id)
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
    and (rep_id is null or app.can_edit_side(team_id, app.rep_side(rep_id)))
  );

-- New columns go last, so the view can be replaced without dropping what reads it.
create or replace view public.assignment_targets
with (security_invoker = true) as
  select
    a.id as assignment_id,
    a.team_id,
    m.user_id,
    a.playbook_id,
    a.package_id,
    a.due_at,
    a.rep_id
  from public.assignments a
  join public.memberships m
    on m.team_id = a.team_id
   and m.role = 'player'
   and (
     m.user_id = a.assignee_user
     or public.position_group_of(m.position) = a.assignee_group
   );

-- 3. A rep assignment opens its play, while the play is published.
create or replace function app.can_view_play(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plays pl
    where pl.id = p
      and pl.archived_at is null
      and (
        app.is_staff(pl.team_id)
        or (
          pl.published_at is not null
          and (
            exists (
              select 1
              from public.playbook_plays pp
              join public.playbooks pb on pb.id = pp.playbook_id and pb.team_id = pl.team_id
              where pp.play_id = p
                and app.assigned_book(pb.id)
            )
            or exists (
              select 1
              from public.assignment_targets at
              join public.scout_reps sr on sr.id = at.rep_id
              where at.user_id = auth.uid()
                and at.team_id = pl.team_id
                and sr.play_id = p
            )
          )
        )
      )
  )
$$;

-- 4. Attempts.
create table public.rep_attempts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  assignment_id uuid not null references public.assignments on delete cascade,
  rep_id uuid not null references public.scout_reps on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  end_x double precision not null check (end_x between -120 and 120),
  end_y double precision not null check (end_y between -60 and 60),
  distance_yd double precision not null check (distance_yd >= 0),
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index rep_attempts_assignment_idx on public.rep_attempts (assignment_id, user_id, created_at);
create index rep_attempts_team_idx on public.rep_attempts (team_id);

alter table public.rep_attempts enable row level security;

create policy rep_attempts_select on public.rep_attempts
  for select to authenticated
  using (app.is_staff(team_id) or (user_id = auth.uid() and app.is_member(team_id)));

-- No write policy and no write grant: submit_rep_attempt is the only writer.
revoke all on table public.rep_attempts from public, anon, authenticated;
grant select on table public.rep_attempts to authenticated;
grant all on table public.rep_attempts to service_role;

-- Removing a member takes their attempts on that team with them, like activity.
create function app.clear_member_rep_attempts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rep_attempts where team_id = old.team_id and user_id = old.user_id;
  return old;
end;
$$;

create trigger memberships_clear_rep_attempts
  after delete on public.memberships
  for each row execute function app.clear_member_rep_attempts();

revoke all on function app.clear_member_rep_attempts() from public, anon, authenticated, service_role;

-- One attempt. The server scores it: distance in yards from the target, and a pass when
-- that is inside the tolerance. Returns the target too, so the app can show the right
-- spot. Retries are unlimited, apart from a cap of 100 a day per rep so a stuck client
-- can't flood the table.
create function public.submit_rep_attempt(
  p_assignment uuid,
  p_x double precision,
  p_y double precision
)
returns table (
  attempt_id uuid,
  distance_yd double precision,
  passed boolean,
  target_x double precision,
  target_y double precision,
  tolerance_yd double precision,
  attempts int
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_team uuid;
  v_rep_id uuid;
  v_rep public.scout_reps%rowtype;
  v_published timestamptz;
  v_archived timestamptz;
  v_today int;
  v_distance double precision;
  v_passed boolean;
  v_id uuid;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_x is null or p_y is null
     or not (p_x between -120 and 120) or not (p_y between -60 and 60) then
    raise exception 'that spot is off the field' using errcode = '22023';
  end if;
  select at.team_id, at.rep_id into v_team, v_rep_id
  from public.assignment_targets at
  where at.assignment_id = p_assignment and at.user_id = uid and at.rep_id is not null
  limit 1;
  if v_team is null then
    raise exception 'homework not found' using errcode = '42501';
  end if;
  select * into v_rep from public.scout_reps where id = v_rep_id;
  select published_at, archived_at into v_published, v_archived
  from public.plays where id = v_rep.play_id;
  if v_published is null or v_archived is not null then
    raise exception 'this play isn''t available right now' using errcode = '42501';
  end if;
  select count(*) into v_today
  from public.rep_attempts ra
  where ra.assignment_id = p_assignment
    and ra.user_id = uid
    and ra.created_at > pg_catalog.now() - interval '1 day';
  if v_today >= 100 then
    raise exception 'that''s 100 tries today. Come back tomorrow' using errcode = '22023';
  end if;
  v_distance := sqrt(power(p_x - v_rep.target_x, 2) + power(p_y - v_rep.target_y, 2));
  v_passed := v_distance <= v_rep.tolerance_yd;
  -- clock_timestamp, not now(): two attempts in one transaction must still sort in the
  -- order they were made, or "first try" could pick the wrong one.
  insert into public.rep_attempts (
    team_id, assignment_id, rep_id, user_id, end_x, end_y, distance_yd, passed, created_at
  ) values (
    v_team, p_assignment, v_rep.id, uid, p_x, p_y, v_distance, v_passed,
    pg_catalog.clock_timestamp()
  )
  returning id into v_id;

  attempt_id := v_id;
  distance_yd := v_distance;
  passed := v_passed;
  target_x := v_rep.target_x;
  target_y := v_rep.target_y;
  tolerance_yd := v_rep.tolerance_yd;
  select count(*)::int into attempts
  from public.rep_attempts ra
  where ra.assignment_id = p_assignment and ra.user_id = uid;
  return next;
end;
$$;

-- 5. A player's reps. The answer (target, tolerance, coaching note) is null until they
-- have made an attempt. Only published, live plays.
create function public.my_rep_homework(p_team uuid)
returns table (
  assignment_id uuid,
  rep_id uuid,
  play_id uuid,
  play_name text,
  play_side text,
  look_id uuid,
  look_name text,
  slot text,
  due_at timestamptz,
  assigned_at timestamptz,
  attempts int,
  passed boolean,
  best_distance double precision,
  last_x double precision,
  last_y double precision,
  last_distance double precision,
  last_passed boolean,
  target_x double precision,
  target_y double precision,
  tolerance_yd double precision,
  note text
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select distinct on (at.assignment_id)
      at.assignment_id, at.rep_id, at.due_at, a.created_at
    from public.assignment_targets at
    join public.assignments a on a.id = at.assignment_id
    where at.team_id = p_team
      and at.user_id = auth.uid()
      and at.rep_id is not null
  ),
  tries as (
    select
      ra.assignment_id,
      count(*)::int as attempts,
      bool_or(ra.passed) as passed,
      min(ra.distance_yd) as best_distance,
      (array_agg(ra.end_x order by ra.created_at desc, ra.id desc))[1] as last_x,
      (array_agg(ra.end_y order by ra.created_at desc, ra.id desc))[1] as last_y,
      (array_agg(ra.distance_yd order by ra.created_at desc, ra.id desc))[1] as last_distance,
      (array_agg(ra.passed order by ra.created_at desc, ra.id desc))[1] as last_passed
    from public.rep_attempts ra
    join mine on mine.assignment_id = ra.assignment_id
    where ra.user_id = auth.uid()
    group by ra.assignment_id
  )
  select
    mine.assignment_id,
    sr.id,
    pl.id,
    pl.name,
    pl.side,
    sr.look_id,
    lk.name,
    sr.slot,
    mine.due_at,
    mine.created_at,
    coalesce(tries.attempts, 0),
    coalesce(tries.passed, false),
    tries.best_distance,
    tries.last_x,
    tries.last_y,
    tries.last_distance,
    tries.last_passed,
    case when tries.attempts > 0 then sr.target_x end,
    case when tries.attempts > 0 then sr.target_y end,
    case when tries.attempts > 0 then sr.tolerance_yd end,
    case when tries.attempts > 0 then sr.note end
  from mine
  join public.scout_reps sr on sr.id = mine.rep_id
  join public.plays pl on pl.id = sr.play_id
  join public.scout_looks lk on lk.id = sr.look_id
  left join tries on tries.assignment_id = mine.assignment_id
  where pl.published_at is not null
    and pl.archived_at is null
  order by mine.due_at nulls last, mine.created_at
$$;

-- 6. Coaches: each assigned player's result on each rep. Security invoker and staff only.
create function public.rep_results(p_team uuid)
returns table (
  assignment_id uuid,
  rep_id uuid,
  user_id uuid,
  due_at timestamptz,
  attempts int,
  first_distance double precision,
  first_passed boolean,
  best_distance double precision,
  passed boolean,
  last_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    at.assignment_id,
    at.rep_id,
    at.user_id,
    at.due_at,
    count(ra.id)::int,
    (array_agg(ra.distance_yd order by ra.created_at, ra.id) filter (where ra.id is not null))[1],
    (array_agg(ra.passed order by ra.created_at, ra.id) filter (where ra.id is not null))[1],
    min(ra.distance_yd),
    coalesce(bool_or(ra.passed), false),
    max(ra.created_at)
  from public.assignment_targets at
  left join public.rep_attempts ra
    on ra.assignment_id = at.assignment_id and ra.user_id = at.user_id
  where at.team_id = p_team
    and at.rep_id is not null
    and app.is_staff(p_team)
  group by at.assignment_id, at.rep_id, at.user_id, at.due_at
$$;

revoke all on function public.submit_rep_attempt(uuid, double precision, double precision)
  from public, anon;
revoke all on function public.my_rep_homework(uuid) from public, anon;
revoke all on function public.rep_results(uuid) from public, anon;
grant execute on function public.submit_rep_attempt(uuid, double precision, double precision)
  to authenticated, service_role;
grant execute on function public.my_rep_homework(uuid) to authenticated, service_role;
grant execute on function public.rep_results(uuid) to authenticated, service_role;

commit;
