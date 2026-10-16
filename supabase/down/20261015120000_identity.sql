-- Rolls back supabase/migrations/20261015120000_identity.sql.
-- Not a migration: supabase db push does not apply this file.

begin;

drop view if exists public.roster_public;
drop table if exists
  public.consent_records,
  public.invites,
  public.memberships,
  public.profiles,
  public.teams;

drop function if exists app.accept_invite(text);
drop function if exists app.stamp_attested_email();
drop function if exists app.guard_last_head_coach();
drop function if exists app.is_owner(uuid);
drop function if exists app.is_head_coach(uuid);
drop function if exists app.is_staff(uuid);
drop function if exists app.is_member(uuid);
drop function if exists app.my_role(uuid);

drop function if exists public.position_group_of(public.position_code);
drop type if exists public.position_group;
drop type if exists public.position_code;
drop type if exists public.team_role;

drop schema if exists app;

drop extension if exists citext;
drop extension if exists pgcrypto;

commit;
