-- Rollback for 20261127000000_playbook_base_formation.sql: playbooks lose their base alignment.

begin;

alter table public.playbooks drop column base_formation;

commit;
