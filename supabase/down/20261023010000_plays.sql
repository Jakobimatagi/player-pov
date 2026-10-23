-- Rolls back supabase/migrations/20261023010000_plays.sql.
-- Not a migration: supabase db push does not apply this file.

begin;

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
drop function if exists app.guard_assignment();

commit;
