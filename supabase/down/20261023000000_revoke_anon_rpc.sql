-- Rolls back supabase/migrations/20261023000000_revoke_anon_rpc.sql.
-- Not a migration: supabase db push does not apply this file.

begin;

grant execute on function public.create_team(text, text, text, text, date) to anon;
grant execute on function public.create_player_invite(uuid, text, text, public.team_role, public.position_code, boolean, text) to anon;
grant execute on function public.accept_invite(uuid) to anon;
grant execute on function public.delete_member_data(uuid, uuid) to anon;
grant execute on function public.update_member(uuid, uuid, public.team_role, public.position_code) to anon;
grant execute on function public.remove_member(uuid, uuid) to anon;
grant execute on function public.revoke_invite(uuid) to anon;
grant execute on function public.resend_invite(uuid) to anon;
grant execute on function public.invite_status(uuid) to anon;

alter default privileges for role postgres grant execute on functions to anon, public;
alter default privileges for role postgres in schema public grant execute on functions to anon, public;
alter default privileges for role postgres in schema app grant execute on functions to anon, public;

commit;
