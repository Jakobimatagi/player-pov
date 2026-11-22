-- Tightens the two playbook diagram changes:
--  * playbook_scripts follows the repo's revoke-then-grant pattern, so anon and public hold no
--    table privileges and row-level security is not the only barrier;
--  * a script must be a JSON object and at most 1 MB, so one row cannot grow without bound;
--  * base_formation is a short key like 'gun-spread', not free text.
begin;

revoke all on table public.playbook_scripts from public, anon, authenticated;
grant select, insert, update, delete on table public.playbook_scripts to authenticated;
grant all on table public.playbook_scripts to service_role;

alter table public.playbook_scripts
  add constraint playbook_scripts_shape
  check (jsonb_typeof(script) = 'object' and pg_column_size(script) <= 1000000);

alter table public.playbooks
  add constraint playbooks_base_formation_check
  check (base_formation is null or base_formation ~ '^[a-z0-9-]{1,40}$');

commit;
