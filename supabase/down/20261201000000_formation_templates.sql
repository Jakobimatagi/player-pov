-- Rollback for 20261201000000_formation_templates.sql. Every saved formation template is
-- dropped, and playbooks whose base alignment pointed at one lose it (back to 'Not set').

begin;

drop trigger playbooks_base_formation_guard on public.playbooks;
drop function app.guard_base_formation();

update public.playbooks set base_formation = null where base_formation like 'tpl:%';

alter table public.playbooks drop constraint playbooks_base_formation_check;
alter table public.playbooks
  add constraint playbooks_base_formation_check
  check (base_formation is null or base_formation ~ '^[a-z0-9-]{1,40}$');

drop table public.formation_templates;
drop function app.touch_formation_template();
drop function app.valid_template_spots(text, jsonb);
drop function app.template_slots(text);

commit;
