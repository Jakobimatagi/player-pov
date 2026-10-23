-- Scout packages, package looks, player slots, and assignment.package_id.
-- Rollback (not applied by supabase db push): supabase/down/20261023041126_scout_packages.sql

begin;

create table public.scout_packages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  name text not null,
  opponent text,
  week_of date,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table public.scout_package_looks (
  package_id uuid references public.scout_packages on delete cascade,
  look_id uuid references public.scout_looks on delete cascade,
  sort int not null,
  primary key (package_id, look_id)
);

create table public.player_slots (
  team_id uuid not null references public.teams on delete cascade,
  play_id uuid not null references public.plays on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  slot text not null,
  primary key (play_id, user_id)
);

alter table public.assignments alter column playbook_id drop not null;
alter table public.assignments
  add column package_id uuid references public.scout_packages on delete cascade;
alter table public.assignments
  add constraint assignments_playbook_or_package
  check ((playbook_id is null) <> (package_id is null));

create or replace function app.guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_team uuid;
  member_role public.team_role;
begin
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
  else
    raise exception 'assignment needs a playbook or a package' using errcode = '23514';
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

-- The view column order matches v2: package_id before due_at.
-- Policies and can_view_play depend on the old view, so they come off first.
drop policy plays_select on public.plays;
drop policy pv_select on public.play_versions;
drop policy looks_select on public.scout_looks;
drop policy lv_select on public.scout_look_versions;
drop policy pbp_select on public.playbook_plays;
drop policy pb_select on public.playbooks;
drop function app.can_view_play(uuid);
drop view public.assignment_targets;

create view public.assignment_targets
with (security_invoker = true) as
  select
    a.id as assignment_id,
    a.team_id,
    m.user_id,
    a.playbook_id,
    a.package_id,
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

create policy plays_select on public.plays
  for select to authenticated
  using (app.can_view_play(id) or app.is_staff(team_id));
create policy pv_select on public.play_versions
  for select to authenticated
  using (app.can_view_play(play_id));
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
          or exists (
            select 1
            from public.assignment_targets at
            join public.scout_package_looks spl on spl.package_id = at.package_id
            where at.user_id = auth.uid()
              and spl.look_id = look.id
              and at.team_id = look.team_id
          )
        )
    )
  );

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

-- Linked look, plus a look in a package assigned to the caller.
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
    or exists (
      select 1
      from public.assignment_targets at
      join public.scout_package_looks spl on spl.package_id = at.package_id
      where at.user_id = auth.uid()
        and spl.look_id = scout_looks.id
        and at.team_id = scout_looks.team_id
    )
  );

alter table public.scout_packages enable row level security;
alter table public.scout_package_looks enable row level security;
alter table public.player_slots enable row level security;

create policy pkg_select on public.scout_packages
  for select to authenticated
  using (
    app.is_staff(team_id)
    or exists (
      select 1
      from public.assignment_targets at
      where at.package_id = scout_packages.id
        and at.user_id = auth.uid()
    )
  );
create policy pkg_write on public.scout_packages
  for all to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));

create policy spl_select on public.scout_package_looks
  for select to authenticated
  using (
    exists (
      select 1
      from public.scout_packages pkg
      where pkg.id = scout_package_looks.package_id
        and (
          app.is_staff(pkg.team_id)
          or exists (
            select 1
            from public.assignment_targets at
            where at.package_id = pkg.id
              and at.user_id = auth.uid()
          )
        )
    )
  );
-- Do not join scout_looks here. looks_select reads this table, so a look
-- join in a SELECT policy recurses. The trigger checks the teams.
create policy spl_write on public.scout_package_looks
  for all to authenticated
  using (
    exists (
      select 1
      from public.scout_packages pkg
      where pkg.id = scout_package_looks.package_id
        and app.is_staff(pkg.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.scout_packages pkg
      where pkg.id = scout_package_looks.package_id
        and app.is_staff(pkg.team_id)
    )
  );

create function app.guard_package_look()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg_team uuid;
  look_team uuid;
begin
  select team_id into pkg_team from public.scout_packages where id = new.package_id;
  select team_id into look_team from public.scout_looks where id = new.look_id;
  if pkg_team is null or look_team is null or pkg_team is distinct from look_team then
    raise exception 'look is not on this package team' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger scout_package_looks_guard
  before insert or update on public.scout_package_looks
  for each row execute function app.guard_package_look();

revoke all on function app.guard_package_look() from public, anon, authenticated, service_role;

create function app.guard_team_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id then
    raise exception 'team_id is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger scout_looks_team_id_guard
  before update on public.scout_looks
  for each row execute function app.guard_team_id();

create trigger scout_packages_team_id_guard
  before update on public.scout_packages
  for each row execute function app.guard_team_id();

revoke all on function app.guard_team_id() from public, anon, authenticated, service_role;

create function app.guard_player_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  play_team uuid;
begin
  select team_id into play_team from public.plays where id = new.play_id;
  if play_team is null or play_team is distinct from new.team_id then
    raise exception 'play is not on this slot''s team' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger player_slots_team_guard
  before insert or update on public.player_slots
  for each row execute function app.guard_player_slot();

revoke all on function app.guard_player_slot() from public, anon, authenticated, service_role;

-- v2 does not name a player_slots policy. Staff write. A player reads their own
-- slot on a play they can already view.
create policy slot_select on public.player_slots
  for select to authenticated
  using (
    app.is_staff(team_id)
    or (user_id = auth.uid() and app.can_view_play(play_id))
  );
create policy slot_write on public.player_slots
  for all to authenticated
  using (app.is_staff(team_id))
  with check (
    app.is_staff(team_id)
    and exists (
      select 1
      from public.plays pl
      where pl.id = player_slots.play_id
        and pl.team_id = player_slots.team_id
    )
    and exists (
      select 1
      from public.memberships m
      where m.team_id = player_slots.team_id
        and m.user_id = player_slots.user_id
        and m.role = 'player'::public.team_role
    )
  );

revoke all on function app.can_view_play(uuid) from public, anon;
grant execute on function app.can_view_play(uuid) to authenticated, service_role;

revoke all on table
  public.scout_packages,
  public.scout_package_looks,
  public.player_slots
  from public, anon, authenticated;
revoke all on table public.assignment_targets from public, anon, authenticated;

grant select, insert, delete on table public.scout_packages to authenticated;
grant update (name, opponent, week_of) on table public.scout_packages to authenticated;
grant select, insert, delete on table public.scout_package_looks to authenticated;
grant update (sort) on table public.scout_package_looks to authenticated;
grant select, insert, delete on table public.player_slots to authenticated;
grant update (slot) on table public.player_slots to authenticated;
grant update (package_id) on table public.assignments to authenticated;
grant select on table public.assignment_targets to authenticated;

grant all on table
  public.scout_packages,
  public.scout_package_looks,
  public.player_slots
  to service_role;
grant select on table public.assignment_targets to service_role;

commit;
