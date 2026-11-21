-- Special teams coordinator and special teams units on the depth chart.
-- Rollback (not applied by supabase db push): supabase/down/20261123000000_special_teams.sql
--
-- coordinates and playbooks.side gain 'special'. Special teams depth moves from six
-- shared slots to six units of eleven (kickoff, kick return, punt, punt return, field
-- goal, PAT), slot ids prefixed by unit.
--
-- Edit rights for 'special' (app.can_edit_side): head coach, the special teams
-- coordinator, and coaches with no side. A team with no special teams coordinator
-- keeps special teams shared, so its OC and DC can still edit them.

begin;

alter table public.memberships drop constraint memberships_coordinates_check;
alter table public.memberships
  add constraint memberships_coordinates_check
  check (coordinates in ('offense', 'defense', 'special'));

alter table public.playbooks drop constraint playbooks_side_check;
alter table public.playbooks
  add constraint playbooks_side_check check (side in ('offense', 'defense', 'special'));

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
        m.coordinates is null
        or s is null
        or m.coordinates = s
        or (
          s = 'special'
          and not exists (
            select 1 from public.memberships st
            where st.team_id = t and st.coordinates = 'special'
          )
        )
      else false
    end
    from public.memberships m
    where m.team_id = t and m.user_id = auth.uid()
  ), false)
$$;

-- Every depth slot and its side. Null means not a slot.
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
    when s in (
      'KO_K', 'KO_L1', 'KO_L2', 'KO_L3', 'KO_L4', 'KO_L5',
      'KO_R1', 'KO_R2', 'KO_R3', 'KO_R4', 'KO_R5',
      'KR_F1', 'KR_F2', 'KR_F3', 'KR_F4', 'KR_F5',
      'KR_S1', 'KR_S2', 'KR_S3', 'KR_S4', 'KR_R1', 'KR_R2',
      'PNT_GL', 'PNT_LT', 'PNT_LG', 'PNT_LS', 'PNT_RG', 'PNT_RT', 'PNT_GR',
      'PNT_LW', 'PNT_RW', 'PNT_PP', 'PNT_P',
      'PR_VL1', 'PR_VL2', 'PR_F1', 'PR_F2', 'PR_F3', 'PR_F4', 'PR_F5',
      'PR_VR2', 'PR_VR1', 'PR_U', 'PR_R',
      'FG_LE', 'FG_LT', 'FG_LG', 'FG_LS', 'FG_RG', 'FG_RT', 'FG_RE',
      'FG_LW', 'FG_RW', 'FG_H', 'FG_K',
      'PAT_LE', 'PAT_LT', 'PAT_LG', 'PAT_LS', 'PAT_RG', 'PAT_RT', 'PAT_RE',
      'PAT_LW', 'PAT_RW', 'PAT_H', 'PAT_K'
    ) then 'special'
    else null
  end
$$;

-- Old shared special slots move into the matching unit.
alter table public.depth_chart drop constraint depth_chart_slot_check;
update public.depth_chart set slot = case slot
  when 'K' then 'FG_K'
  when 'P' then 'PNT_P'
  when 'LS' then 'PNT_LS'
  when 'HLD' then 'FG_H'
  when 'KR' then 'KR_R1'
  when 'PR' then 'PR_R'
  else slot
end
where slot in ('K', 'P', 'LS', 'HLD', 'KR', 'PR');
alter table public.depth_chart
  add constraint depth_chart_slot_check check (app.depth_slot_side(slot) is not null);

-- Unknown positions fail clearly instead of slipping past the side check.
create or replace function public.set_depth(p_team uuid, p_slot text, p_players uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if app.depth_slot_side(p_slot) is null then
    raise exception 'unknown position %', p_slot using errcode = '23514';
  end if;
  if coalesce(array_length(p_players, 1), 0) > 6 then
    raise exception 'at most 6 deep' using errcode = '23514';
  end if;
  if not (app.is_staff(p_team) and app.can_edit_side(p_team, app.depth_slot_side(p_slot))) then
    raise exception 'not allowed to edit this position' using errcode = '42501';
  end if;
  delete from public.depth_chart where team_id = p_team and slot = p_slot;
  insert into public.depth_chart (team_id, slot, rank, roster_player_id)
  select p_team, p_slot, ord::smallint, player
  from unnest(p_players) with ordinality as t(player, ord);
end;
$$;

commit;
