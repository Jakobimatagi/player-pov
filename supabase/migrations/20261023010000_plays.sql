-- Plays, scout looks, playbooks, and assignments.
-- Players read a play only when it is assigned to them and not archived.
-- package_id is deferred until scout_packages exists.
-- Rollback (not applied by supabase db push): supabase/down/20261023010000_plays.sql

begin;

create table public.plays (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  name text not null check (length(name) between 1 and 80),
  side text not null default 'offense' check (side in ('offense', 'defense')),
  formation text,
  tags text[] not null default '{}',
  default_look_id uuid,
  current_version int,
  archived_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.play_versions (
  play_id uuid references public.plays on delete cascade,
  version int not null,
  source jsonb not null,
  compiled jsonb not null,
  source_schema smallint not null,
  compiled_schema smallint not null,
  compiler_version text not null,
  checksum text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (play_id, version)
);

create table public.scout_looks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  side text not null check (side in ('offense', 'defense')),
  name text not null,
  front text,
  coverage text,
  opponent text,
  current_version int,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.scout_look_versions (
  look_id uuid references public.scout_looks on delete cascade,
  version int not null,
  source jsonb not null,
  checksum text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (look_id, version)
);

-- (team_id, id) lets a play's default look be tied to the same team.
alter table public.scout_looks
  add constraint scout_looks_team_id_id_key unique (team_id, id);

alter table public.plays
  add constraint plays_default_look_team_fkey
  foreign key (team_id, default_look_id)
  references public.scout_looks (team_id, id)
  on delete set null (default_look_id);

create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  name text not null,
  description text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);

-- No created_by column. v2 does not define one, so inserts cannot stamp it.
create table public.playbook_plays (
  playbook_id uuid references public.playbooks on delete cascade,
  play_id uuid references public.plays on delete cascade,
  sort int not null,
  pinned_version int,
  primary key (playbook_id, play_id)
);

-- package_id waits for scout_packages. A row is a playbook assignment.
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  playbook_id uuid not null references public.playbooks on delete cascade,
  assignee_user uuid references auth.users on delete cascade,
  assignee_group public.position_group,
  due_at timestamptz,
  created_by uuid default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  check ((assignee_user is null) <> (assignee_group is null))
);

create index plays_team_live_idx on public.plays (team_id) where archived_at is null;

create function app.guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  book_team uuid;
  member_role public.team_role;
begin
  select team_id into book_team from public.playbooks where id = new.playbook_id;
  if book_team is null or book_team is distinct from new.team_id then
    raise exception 'playbook is not on this team' using errcode = '23514';
  end if;
  if new.assignee_user is not null then
    select role into member_role
    from public.memberships
    where team_id = new.team_id and user_id = new.assignee_user;
    if member_role is distinct from 'player'::public.team_role then
      raise exception 'assignee must be a player on this team' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger assignments_guard
  before insert or update on public.assignments
  for each row execute function app.guard_assignment();

create function app.guard_playbook_play()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  book_team uuid;
  play_team uuid;
begin
  select team_id into book_team from public.playbooks where id = new.playbook_id;
  select team_id into play_team from public.plays where id = new.play_id;
  if book_team is null or play_team is null or book_team is distinct from play_team then
    raise exception 'play is not on this playbook''s team' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger playbook_plays_team_guard
  before insert or update on public.playbook_plays
  for each row execute function app.guard_playbook_play();

create function app.touch_play_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger plays_touch_updated_at
  before update on public.plays
  for each row execute function app.touch_play_updated_at();

create view public.assignment_targets
with (security_invoker = true) as
  select
    a.id as assignment_id,
    a.team_id,
    m.user_id,
    a.playbook_id,
    a.due_at
  from public.assignments a
  join public.memberships m
    on m.team_id = a.team_id
   and m.role = 'player'
   and (
     m.user_id = a.assignee_user
     or public.position_group_of(m.position) = a.assignee_group
   );

create function app.can_view_play(p uuid)
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
        or exists (
          select 1
          from public.assignment_targets at
          join public.playbook_plays pp on pp.playbook_id = at.playbook_id
          join public.playbooks pb on pb.id = at.playbook_id and pb.archived_at is null
          where at.user_id = auth.uid()
            and pp.play_id = p
            and at.team_id = pl.team_id
        )
      )
  )
$$;

alter table public.plays enable row level security;
alter table public.play_versions enable row level security;
alter table public.scout_looks enable row level security;
alter table public.scout_look_versions enable row level security;
alter table public.playbooks enable row level security;
alter table public.playbook_plays enable row level security;
alter table public.assignments enable row level security;

-- can_view_play hides archived plays, including from staff.
-- is_staff lets staff see an archived play and restore it.
create policy plays_select on public.plays
  for select to authenticated
  using (app.can_view_play(id) or app.is_staff(team_id));
create policy plays_update on public.plays
  for update to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));

create policy pv_select on public.play_versions
  for select to authenticated
  using (app.can_view_play(play_id));

-- A linked look is readable by someone who can view a play that points at it.
create policy looks_select on public.scout_looks
  for select to authenticated
  using (
    app.is_staff(team_id)
    or exists (
      select 1
      from public.plays pl
      where pl.default_look_id = scout_looks.id
        and pl.team_id = scout_looks.team_id
        and app.can_view_play(pl.id)
    )
  );
create policy looks_write on public.scout_looks
  for update to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));

create policy lv_select on public.scout_look_versions
  for select to authenticated
  using (
    exists (
      select 1
      from public.scout_looks look
      where look.id = scout_look_versions.look_id
        and (
          app.is_staff(look.team_id)
          or exists (
            select 1
            from public.plays pl
            where pl.default_look_id = look.id
              and pl.team_id = look.team_id
              and app.can_view_play(pl.id)
          )
        )
    )
  );

create policy pb_select on public.playbooks
  for select to authenticated
  using (
    app.is_staff(team_id)
    or (
      archived_at is null
      and exists (
        select 1
        from public.assignment_targets at
        where at.playbook_id = playbooks.id
          and at.user_id = auth.uid()
      )
    )
  );
create policy pb_insert on public.playbooks
  for insert to authenticated
  with check (app.is_staff(team_id) and created_by = auth.uid());
create policy pb_update on public.playbooks
  for update to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));
create policy pb_delete on public.playbooks
  for delete to authenticated
  using (app.is_staff(team_id));

create policy pbp_select on public.playbook_plays
  for select to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and (
          app.is_staff(book.team_id)
          or app.can_view_play(playbook_plays.play_id)
        )
    )
  );
create policy pbp_write on public.playbook_plays
  for all to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
    )
  );

create policy asg_select on public.assignments
  for select to authenticated
  using (
    app.is_staff(team_id)
    or assignee_user = auth.uid()
    or (
      assignee_group is not null
      and exists (
        select 1
        from public.memberships mine
        where mine.team_id = assignments.team_id
          and mine.user_id = auth.uid()
          and mine.role = 'player'::public.team_role
          and public.position_group_of(mine.position) = assignments.assignee_group
      )
    )
  );
create policy asg_insert on public.assignments
  for insert to authenticated
  with check (app.is_staff(team_id) and created_by = auth.uid());
create policy asg_update on public.assignments
  for update to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));
create policy asg_delete on public.assignments
  for delete to authenticated
  using (app.is_staff(team_id));

create function public.save_play_version(
  p_team uuid,
  p_play uuid,
  p_expected int,
  p_name text,
  p_source jsonb,
  p_compiled jsonb,
  p_checksum text,
  p_compiler text,
  p_look uuid,
  p_look_expected int,
  p_look_source jsonb,
  p_look_checksum text
)
returns table (play_id uuid, version int, look_id uuid, look_version int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_play uuid;
  v_version int;
  v_current int;
  v_look uuid;
  v_look_version int;
  v_look_current int;
  v_side text;
  v_look_side text;
  v_look_name text;
begin
  if not app.is_staff(p_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_name is null or length(p_name) < 1 or length(p_name) > 80 then
    raise exception 'name length' using errcode = '22023';
  end if;
  if p_source is null or octet_length(p_source::text) >= 65536 then
    raise exception 'source is over 64KB' using errcode = '22023';
  end if;
  if p_compiled is null or octet_length(p_compiled::text) >= 65536 then
    raise exception 'compiled is over 64KB' using errcode = '22023';
  end if;
  if p_look_source is null or octet_length(p_look_source::text) >= 65536 then
    raise exception 'look source is over 64KB' using errcode = '22023';
  end if;
  -- Checksums are a client integrity hint. The server checks the shape only.
  if p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'checksum must be 64 hex characters' using errcode = '22023';
  end if;
  if p_look_checksum is null or p_look_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'look checksum must be 64 hex characters' using errcode = '22023';
  end if;
  if jsonb_typeof(p_compiled -> 'players') = 'array' and exists (
    select 1
    from jsonb_array_elements(p_compiled -> 'players') as player
    where jsonb_typeof(player -> 'waypoints') = 'array'
      and jsonb_array_length(player -> 'waypoints') > 12
  ) then
    raise exception 'too many waypoints' using errcode = '22023';
  end if;

  v_side := coalesce(p_source ->> 'side', 'offense');
  if v_side not in ('offense', 'defense') then
    raise exception 'side must be offense or defense' using errcode = '22023';
  end if;
  v_look_side := coalesce(p_look_source ->> 'side', 'defense');
  if v_look_side not in ('offense', 'defense') then
    raise exception 'look side must be offense or defense' using errcode = '22023';
  end if;
  v_look_name := coalesce(p_look_source ->> 'name', p_name);
  if length(v_look_name) < 1 then
    raise exception 'look name length' using errcode = '22023';
  end if;

  if p_play is null then
    if p_expected is not null then
      raise exception 'version conflict' using errcode = 'PT409';
    end if;
    insert into public.plays (team_id, name, side, created_by)
    values (p_team, p_name, v_side, auth.uid())
    returning id, current_version into v_play, v_current;
  else
    select plays.id, plays.current_version
      into v_play, v_current
    from public.plays
    where plays.id = p_play and plays.team_id = p_team
    for update;
    if v_play is null then
      raise exception 'play not found' using errcode = 'P0002';
    end if;
    if v_current is distinct from p_expected then
      raise exception 'version conflict' using errcode = 'PT409';
    end if;
  end if;

  if p_look is null then
    if p_look_expected is not null then
      raise exception 'version conflict' using errcode = 'PT409';
    end if;
    insert into public.scout_looks (team_id, side, name, created_by)
    values (p_team, v_look_side, v_look_name, auth.uid())
    returning id, current_version into v_look, v_look_current;
  else
    select scout_looks.id, scout_looks.current_version
      into v_look, v_look_current
    from public.scout_looks
    where scout_looks.id = p_look and scout_looks.team_id = p_team
    for update;
    if v_look is null then
      raise exception 'look not found' using errcode = 'P0002';
    end if;
    if v_look_current is distinct from p_look_expected then
      raise exception 'version conflict' using errcode = 'PT409';
    end if;
  end if;

  v_version := coalesce(v_current, 0) + 1;
  v_look_version := coalesce(v_look_current, 0) + 1;

  insert into public.play_versions (
    play_id, version, source, compiled, source_schema, compiled_schema,
    compiler_version, checksum, created_by
  ) values (
    v_play, v_version, p_source, p_compiled, 1, 1, p_compiler, p_checksum, auth.uid()
  );
  insert into public.scout_look_versions (look_id, version, source, checksum, created_by)
  values (v_look, v_look_version, p_look_source, p_look_checksum, auth.uid());

  update public.plays
  set name = p_name,
      side = v_side,
      current_version = v_version,
      default_look_id = v_look,
      updated_at = now()
  where id = v_play;
  update public.scout_looks
  set name = v_look_name,
      side = v_look_side,
      current_version = v_look_version
  where id = v_look;

  play_id := v_play;
  version := v_version;
  look_id := v_look;
  look_version := v_look_version;
  return next;
end;
$$;

revoke all on function app.guard_assignment() from public, anon, authenticated;
revoke all on function app.guard_playbook_play() from public, anon, authenticated;
revoke all on function app.touch_play_updated_at() from public, anon, authenticated;
revoke all on function app.can_view_play(uuid) from public, anon;
grant execute on function app.guard_assignment() to service_role;
grant execute on function app.guard_playbook_play() to service_role;
grant execute on function app.can_view_play(uuid) to authenticated, service_role;

revoke all on function public.save_play_version(
  uuid, uuid, int, text, jsonb, jsonb, text, text, uuid, int, jsonb, text
) from public, anon, service_role;
grant execute on function public.save_play_version(
  uuid, uuid, int, text, jsonb, jsonb, text, text, uuid, int, jsonb, text
) to authenticated;

-- Default privileges grant every privilege to anon, authenticated, and
-- service_role when the table is created. Revoke those, then grant back
-- only what each role may have. A revoke that skips authenticated leaves
-- the default insert and delete grants in place.
revoke all on table
  public.plays,
  public.play_versions,
  public.scout_looks,
  public.scout_look_versions,
  public.playbooks,
  public.playbook_plays,
  public.assignments
  from public, anon, authenticated;
revoke all on table public.assignment_targets from public, anon, authenticated;

-- Column grants. team_id, created_by, and version columns are written by the RPC.
grant select on table public.plays to authenticated;
grant update (name, formation, tags, archived_at) on table public.plays to authenticated;
grant select on table public.play_versions to authenticated;
grant select on table public.scout_looks to authenticated;
grant update (name, side, front, coverage, opponent) on table public.scout_looks to authenticated;
grant select on table public.scout_look_versions to authenticated;
grant select, insert, delete on table public.playbooks to authenticated;
grant update (name, description, archived_at) on table public.playbooks to authenticated;
grant select, insert, delete on table public.playbook_plays to authenticated;
grant update (sort) on table public.playbook_plays to authenticated;
grant select, insert, delete on table public.assignments to authenticated;
grant update (playbook_id, assignee_user, assignee_group, due_at) on table public.assignments to authenticated;
grant select on table public.assignment_targets to authenticated;

grant all on table
  public.plays,
  public.play_versions,
  public.scout_looks,
  public.scout_look_versions,
  public.playbooks,
  public.playbook_plays,
  public.assignments
  to service_role;
grant select on table public.assignment_targets to service_role;

commit;
