-- Rollback for 20261121000000_coordinators_position_rules.sql.

begin;

drop table if exists public.position_rules;
drop function if exists app.stamp_position_rule();

drop policy if exists pb_insert on public.playbooks;
drop policy if exists pb_update on public.playbooks;
drop policy if exists pb_delete on public.playbooks;
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

drop policy if exists pbp_write on public.playbook_plays;
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
drop function if exists app.book_side(uuid);

drop index if exists public.playbooks_team_side_idx;
alter table public.playbooks drop column if exists side;

drop trigger if exists memberships_last_head_coach on public.memberships;
create trigger memberships_last_head_coach
  before update or delete on public.memberships
  for each row execute function app.guard_last_head_coach();
drop trigger if exists memberships_clear_coordinates on public.memberships;
drop function if exists app.clear_player_coordinates();

drop function if exists app.can_edit_side(uuid, text);
drop function if exists app.my_side(uuid);
alter table public.memberships drop constraint if exists memberships_coordinates_staff;
alter table public.memberships drop column if exists coordinates;

commit;
