-- Rollback for 20261129000000_playbook_scripts_hardening.sql: drops the two checks and gives
-- the table its earlier, broader grants back (anon included; row-level security still applies).

begin;

alter table public.playbooks drop constraint playbooks_base_formation_check;
alter table public.playbook_scripts drop constraint playbook_scripts_shape;
grant all on table public.playbook_scripts to anon, authenticated, service_role;

commit;
