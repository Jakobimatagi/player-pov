-- Rollback for 20261126000000_assignment_sides.sql: any coach can assign any book again.

begin;

drop policy asg_insert on public.assignments;
drop policy asg_update on public.assignments;
drop policy asg_delete on public.assignments;

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

commit;
