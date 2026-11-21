-- Rollback for 20261123000000_special_teams.sql. Special teams depth outside the six
-- old slots, and 'special' coordinators and playbooks, are dropped back to shared.

begin;

alter table public.depth_chart drop constraint depth_chart_slot_check;
delete from public.depth_chart
where slot like 'KO\_%' or slot like 'PAT\_%'
   or (slot like 'KR\_%' and slot <> 'KR_R1')
   or (slot like 'PR\_%' and slot <> 'PR_R')
   or (slot like 'PNT\_%' and slot not in ('PNT_P', 'PNT_LS'))
   or (slot like 'FG\_%' and slot not in ('FG_K', 'FG_H'));
update public.depth_chart set slot = case slot
  when 'FG_K' then 'K'
  when 'PNT_P' then 'P'
  when 'PNT_LS' then 'LS'
  when 'FG_H' then 'HLD'
  when 'KR_R1' then 'KR'
  when 'PR_R' then 'PR'
  else slot
end;

create or replace function app.depth_slot_side(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when s in ('X', 'LT', 'LG', 'C', 'RG', 'RT', 'Y', 'Z', 'SL', 'QB', 'RB') then 'offense'
    when s in ('LCB', 'LDE', 'LDT', 'RDT', 'RDE', 'RCB', 'SAM', 'MIKE', 'WILL', 'SS', 'FS')
      then 'defense'
    else null
  end
$$;

alter table public.depth_chart
  add constraint depth_chart_slot_check check (
    slot in (
      'X', 'LT', 'LG', 'C', 'RG', 'RT', 'Y', 'Z', 'SL', 'QB', 'RB',
      'LCB', 'LDE', 'LDT', 'RDT', 'RDE', 'RCB', 'SAM', 'MIKE', 'WILL', 'SS', 'FS',
      'K', 'P', 'LS', 'HLD', 'KR', 'PR'
    )
  );

create or replace function app.can_edit_side(t uuid, s text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when m.role = 'head_coach'::public.team_role then true
      when m.role = 'coach'::public.team_role then
        m.coordinates is null or s is null or m.coordinates = s
      else false
    end
    from public.memberships m
    where m.team_id = t and m.user_id = auth.uid()
  ), false)
$$;

update public.playbooks set side = null where side = 'special';
alter table public.playbooks drop constraint playbooks_side_check;
alter table public.playbooks
  add constraint playbooks_side_check check (side in ('offense', 'defense'));

update public.memberships set coordinates = null where coordinates = 'special';
alter table public.memberships drop constraint memberships_coordinates_check;
alter table public.memberships
  add constraint memberships_coordinates_check check (coordinates in ('offense', 'defense'));

commit;
