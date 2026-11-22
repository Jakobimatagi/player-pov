-- Rollback for 20261206000000_depth_notes.sql: drops depth notes and the player read
-- path, and puts merge_roster_players back the way 20261122000000_roster_depth_chart.sql
-- left it.

begin;

drop function if exists public.my_depth_notes(uuid);
drop function if exists public.my_depth_spots(uuid);
drop function if exists public.team_depth_notes(uuid);
drop table if exists public.depth_notes;
drop function if exists app.guard_depth_note();

create or replace function public.merge_roster_players(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  keep_row public.roster_players;
  drop_row public.roster_players;
begin
  select * into keep_row from public.roster_players where id = p_keep;
  select * into drop_row from public.roster_players where id = p_drop;
  if keep_row.id is null or drop_row.id is null or keep_row.team_id <> drop_row.team_id
     or p_keep = p_drop then
    raise exception 'pick two players on the same roster' using errcode = '23514';
  end if;
  if not app.is_staff(keep_row.team_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if drop_row.user_id is not null then
    raise exception 'only a player without an account can be merged away' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.depth_chart d
    where d.team_id = keep_row.team_id
      and d.roster_player_id = p_drop
      and not app.can_edit_side(d.team_id, app.depth_slot_side(d.slot))
  ) then
    raise exception 'merging would change depth chart spots you cannot edit' using errcode = '42501';
  end if;
  update public.roster_players set
    jersey = coalesce(keep_row.jersey, drop_row.jersey),
    alt_positions = case when cardinality(keep_row.alt_positions) = 0
                         then drop_row.alt_positions else keep_row.alt_positions end,
    grad_year = coalesce(keep_row.grad_year, drop_row.grad_year),
    height_in = coalesce(keep_row.height_in, drop_row.height_in),
    weight_lb = coalesce(keep_row.weight_lb, drop_row.weight_lb),
    notes = coalesce(keep_row.notes, drop_row.notes)
  where id = p_keep;
  delete from public.depth_chart d
  where d.roster_player_id = p_drop
    and exists (
      select 1 from public.depth_chart k
      where k.team_id = d.team_id and k.slot = d.slot and k.roster_player_id = p_keep
    );
  update public.depth_chart set roster_player_id = p_keep where roster_player_id = p_drop;
  delete from public.roster_players where id = p_drop;
end;
$$;

commit;
