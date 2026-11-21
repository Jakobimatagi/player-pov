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

drop index if exists public.playbooks_team_side_idx;
alter table public.playbooks drop column if exists side;

drop function if exists app.can_edit_side(uuid, text);
drop function if exists app.my_side(uuid);
alter table public.memberships drop constraint if exists memberships_coordinates_staff;
alter table public.memberships drop column if exists coordinates;

commit;
