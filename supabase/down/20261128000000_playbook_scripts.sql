-- Rollback for 20261128000000_playbook_scripts.sql: drops every saved diagram script.

begin;

drop table public.playbook_scripts;
drop function app.touch_playbook_script();

commit;
