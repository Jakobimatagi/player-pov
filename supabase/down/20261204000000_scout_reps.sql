-- Rollback for 20261204000000_scout_reps.sql: drops scout reps, their attempts and every
-- rep assignment, and puts assignments back to "a playbook or a package".

begin;

drop function public.rep_results(uuid);
drop function public.my_rep_homework(uuid);
drop function public.submit_rep_attempt(uuid, double precision, double precision);
drop trigger memberships_clear_rep_attempts on public.memberships;
drop function app.clear_member_rep_attempts();
drop table public.rep_attempts;

-- Players read published plays in an assigned book only, as before.
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
          and exists (
            select 1
            from public.playbook_plays pp
            join public.playbooks pb on pb.id = pp.playbook_id and pb.team_id = pl.team_id
            where pp.play_id = p
              and app.assigned_book(pb.id)
          )
        )
      )
  )
$$;

-- The view loses rep_id. Policies that read it come off and go back on around it.
drop policy looks_select on public.scout_looks;
drop policy lv_select on public.scout_look_versions;
drop policy pkg_select on public.scout_packages;
drop policy spl_select on public.scout_package_looks;
drop view public.assignment_targets;

delete from public.assignments where rep_id is not null;

drop policy asg_insert on public.assignments;
drop policy asg_update on public.assignments;
drop policy asg_delete on public.assignments;

drop index public.assignments_rep_user_key;
drop index public.assignments_rep_group_key;
alter table public.assignments drop constraint assignments_one_target;
alter table public.assignments drop column rep_id;
alter table public.assignments
  add constraint assignments_playbook_or_package
  check ((playbook_id is null) <> (package_id is null));

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

revoke all on table public.assignment_targets from public, anon, authenticated;
grant select on table public.assignment_targets to authenticated, service_role;

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

create policy asg_insert on public.assignments
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and created_by = auth.uid()
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
  );
create policy asg_update on public.assignments
  for update to authenticated
  using (
    app.is_staff(team_id)
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
  )
  with check (
    app.is_staff(team_id)
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
  );
create policy asg_delete on public.assignments
  for delete to authenticated
  using (
    app.is_staff(team_id)
    and (playbook_id is null or app.can_edit_side(team_id, app.book_side(playbook_id)))
  );

drop function app.rep_look_reaches(uuid, uuid, uuid, uuid, public.position_group);
drop table public.scout_reps;
drop function app.guard_scout_rep();
drop function app.rep_side(uuid);
drop function app.play_side(uuid);

commit;
