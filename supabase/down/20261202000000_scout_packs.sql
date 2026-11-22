-- Rollback for 20261202000000_scout_packs.sql: no scout tasks, no coach rooms, and edit
-- rights follow the side rules alone again. Pack folders stay as plain folders.

begin;

drop function if exists public.create_scout_pack(uuid, text, date, text, text, text[]);

drop trigger if exists memberships_scout_cleanup on public.memberships;
drop function if exists app.clear_coach_scout_tasks();

drop policy if exists variants_insert on public.position_rule_variants;
drop policy if exists variants_update on public.position_rule_variants;
drop policy if exists variants_delete on public.position_rule_variants;
create policy variants_insert on public.position_rule_variants
  for insert to authenticated
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy variants_update on public.position_rule_variants
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side))
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy variants_delete on public.position_rule_variants
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side));

drop policy if exists rules_insert on public.position_rules;
drop policy if exists rules_update on public.position_rules;
drop policy if exists rules_delete on public.position_rules;
create policy rules_insert on public.position_rules
  for insert to authenticated
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy rules_update on public.position_rules
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side))
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy rules_delete on public.position_rules
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side));

drop policy if exists ps_write on public.playbook_scripts;
create policy ps_write on public.playbook_scripts
  for all to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_scripts.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_scripts.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  );

drop policy if exists pbp_write on public.playbook_plays;
create policy pbp_write on public.playbook_plays
  for all to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  );

drop trigger if exists playbooks_section_guard on public.playbooks;
drop function if exists app.guard_section_edit();

drop policy if exists pb_insert on public.playbooks;
drop policy if exists pb_update on public.playbooks;
drop policy if exists pb_delete on public.playbooks;
create policy pb_insert on public.playbooks
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and app.can_edit_side(team_id, coalesce(side, app.book_side(parent_id)))
    and created_by = auth.uid()
  );
create policy pb_update on public.playbooks
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.book_side(id)))
  with check (
    app.is_staff(team_id)
    and app.can_edit_side(team_id, coalesce(side, app.book_side(parent_id)))
  );
create policy pb_delete on public.playbooks
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.book_side(id)));

drop table if exists public.scout_tasks;
drop function if exists app.guard_scout_task();
drop function if exists app.manages_scout_task(uuid, uuid, uuid);
drop function if exists app.owns_play(uuid);
drop function if exists app.folder_within(uuid, uuid);
drop function if exists app.can_edit_book(uuid);
drop function if exists app.owns_section(uuid);
drop function if exists app.is_scout_assignee(uuid, uuid, public.position_group);

drop index if exists public.playbooks_pack_week_key;
alter table public.playbooks drop column if exists pack_week;

drop trigger if exists memberships_clear_coach_groups on public.memberships;
drop function if exists app.clear_player_coach_groups();
alter table public.memberships drop constraint if exists memberships_coach_groups_staff;
alter table public.memberships drop column if exists coach_groups;

commit;
