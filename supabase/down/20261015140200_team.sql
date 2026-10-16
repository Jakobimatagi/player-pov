-- Rolls back supabase/migrations/20261015140200_team.sql.
-- Not a migration: supabase db push does not apply this file.

begin;

drop function if exists public.create_invite(uuid, text, text, public.team_role, public.position_code, text);
drop function if exists public.create_team(text, text, text, text, date);
drop function if exists app.create_invite(uuid, text, text, public.team_role, public.position_code, text);
drop function if exists app.create_team(text, text, text, text, date);

commit;
