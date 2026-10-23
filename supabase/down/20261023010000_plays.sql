-- Rolls back supabase/migrations/20261023010000_plays.sql.
-- Not a migration: supabase db push does not apply this file.

begin;

drop policy if exists plays_select on public.plays;
drop policy if exists plays_update on public.plays;
drop policy if exists pv_select on public.play_versions;
drop policy if exists looks_select on public.scout_looks;
drop policy if exists looks_write on public.scout_looks;
drop policy if exists lv_select on public.scout_look_versions;
drop policy if exists pb_select on public.playbooks;
drop policy if exists pb_write on public.playbooks;
drop policy if exists pbp_select on public.playbook_plays;
drop policy if exists pbp_write on public.playbook_plays;
drop policy if exists asg_select on public.assignments;
drop policy if exists asg_write on public.assignments;

drop view if exists public.assignment_targets;
drop table if exists public.assignments;
drop table if exists public.playbook_plays;
drop table if exists public.playbooks;
drop table if exists public.play_versions;
drop table if exists public.plays;
drop table if exists public.scout_look_versions;
drop table if exists public.scout_looks;

drop function if exists public.save_play_version(
  uuid, uuid, int, text, jsonb, jsonb, text, text, uuid, int, jsonb, text
);
drop function if exists app.can_view_play(uuid);
drop function if exists app.guard_playbook_play();
drop function if exists app.touch_play_updated_at();
drop function if exists app.guard_assignment();

commit;
