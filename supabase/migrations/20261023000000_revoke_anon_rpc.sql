-- 20261015140200_team.sql revokes these functions from public and grants
-- execute to authenticated. Supabase default privileges also grant execute
-- to anon directly, so anon can still call them. Revoke that grant.
-- Authenticated grants stay as they are.
--
-- public.roster_public is a security definer view by design. It is granted
-- only to authenticated. anon and public are revoked. Advisor lint 0010
-- on that view is expected.
--
-- Rollback (not applied by supabase db push): supabase/down/20261023000000_revoke_anon_rpc.sql

revoke execute on function public.create_team(text, text, text, text, date) from anon;
revoke execute on function public.create_player_invite(uuid, text, text, public.team_role, public.position_code, boolean, text) from anon;
revoke execute on function public.accept_invite(uuid) from anon;
revoke execute on function public.delete_member_data(uuid, uuid) from anon;
revoke execute on function public.update_member(uuid, uuid, public.team_role, public.position_code) from anon;
revoke execute on function public.remove_member(uuid, uuid) from anon;
revoke execute on function public.revoke_invite(uuid) from anon;
revoke execute on function public.resend_invite(uuid) from anon;
revoke execute on function public.invite_status(uuid) from anon;
