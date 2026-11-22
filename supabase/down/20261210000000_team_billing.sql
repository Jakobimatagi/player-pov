-- Rollback for 20261210000000_team_billing.sql.

begin;

drop function if exists public.team_billing(uuid);

commit;
