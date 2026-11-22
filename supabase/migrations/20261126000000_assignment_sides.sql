-- Assigning a playbook follows the book's side, like editing it does.
-- Rollback (not applied by supabase db push): supabase/down/20261126000000_assignment_sides.sql
--
-- Before this, any coach could assign any book, so the offensive coordinator could hand
-- the defense its homework. Now a playbook assignment needs app.can_edit_side on the
-- book's side (app.book_side): the head coach, that side's coordinator, or a coach with
-- no side. Shared books and scout-package assignments stay open to every coach.

begin;

drop policy asg_insert on public.assignments;
drop policy asg_update on public.assignments;
drop policy asg_delete on public.assignments;

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

commit;
