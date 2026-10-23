-- Rolls back supabase/migrations/20261023041126_scout_packages.sql.
-- Not a migration: supabase db push does not apply this file.

begin;

drop policy if exists plays_select on public.plays;
drop policy if exists pv_select on public.play_versions;
drop policy if exists looks_select on public.scout_looks;
drop policy if exists lv_select on public.scout_look_versions;
drop policy if exists pbp_select on public.playbook_plays;
drop policy if exists pb_select on public.playbooks;
drop table if exists public.player_slots;
drop policy if exists pkg_select on public.scout_packages;
drop policy if exists pkg_write on public.scout_packages;
drop policy if exists spl_select on public.scout_package_looks;
drop policy if exists spl_write on public.scout_package_looks;
drop trigger if exists scout_looks_team_id_guard on public.scout_looks;
drop function if exists app.can_view_play(uuid);
drop view if exists public.assignment_targets;

delete from public.assignments where playbook_id is null;
alter table public.assignments drop constraint if exists assignments_playbook_or_package;
alter table public.assignments drop column if exists package_id;
alter table public.assignments alter column playbook_id set not null;

drop table if exists public.scout_package_looks;
drop table if exists public.scout_packages;
drop function if exists app.guard_package_look();
drop function if exists app.guard_team_id();
drop function if exists app.guard_player_slot();

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

revoke all on table public.assignment_targets from public, anon, authenticated;
grant select on table public.assignment_targets to authenticated;
grant select on table public.assignment_targets to service_role;

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
          where at.user_id = auth.uid()
            and pp.play_id = p
            and at.team_id = pl.team_id
        )
      )
  )
$$;

revoke all on function app.can_view_play(uuid) from public, anon;
grant execute on function app.can_view_play(uuid) to authenticated, service_role;

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

create or replace function app.guard_assignment()
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

commit;
