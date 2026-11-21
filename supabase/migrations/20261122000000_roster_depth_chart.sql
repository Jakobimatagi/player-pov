-- Roster sheet and depth chart.
-- roster_players is the coach's roster: one row per player, with or without an app
-- account. A row can link to a player membership; members get a row automatically.
-- depth_chart orders roster players at each field position (slot), 1 = starter.
-- Both are staff-only. Players read nothing here.
-- Rollback (not applied by supabase db push): supabase/down/20261122000000_roster_depth_chart.sql
--
-- Data kept is football-only on purpose: name, jersey, positions, grad year, height,
-- weight, staff notes. No contact details, birthdates or addresses.

begin;

create table public.roster_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  jersey smallint check (jersey between 0 and 99),
  position public.position_code,
  alt_positions public.position_code[] not null default '{}',
  grad_year smallint check (grad_year between 2000 and 2100),
  height_in smallint check (height_in between 48 and 96),
  weight_lb smallint check (weight_lb between 60 and 450),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id),
  unique (team_id, id)
);

create index roster_players_team_idx on public.roster_players (team_id);

-- A linked account must be a player on the same team.
create function app.guard_roster_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.memberships m
    where m.team_id = new.team_id
      and m.user_id = new.user_id
      and m.role = 'player'::public.team_role
  ) then
    raise exception 'linked account must be a player on this team' using errcode = '23514';
  end if;
  -- An account's position also drives playbook assignment by position group, so it keeps
  -- the existing rule: only the head coach changes it. Depth > 1 is the membership sync.
  if tg_op = 'UPDATE'
     and new.user_id is not null
     and new.position is distinct from old.position
     and pg_catalog.pg_trigger_depth() = 1
     and not app.is_head_coach(new.team_id) then
    raise exception 'only the head coach changes a player''s position' using errcode = '42501';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger roster_players_guard
  before insert or update on public.roster_players
  for each row execute function app.guard_roster_player();

-- Every player membership has a roster row. Removing the membership removes the row
-- (and its depth chart spots), so delete_member_data leaves nothing behind.
create function app.sync_roster_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.roster_players where team_id = old.team_id and user_id = old.user_id;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.role = 'player'::public.team_role
     and old.role = 'player'::public.team_role then
    update public.roster_players set position = new.position
    where team_id = new.team_id and user_id = new.user_id
      and position is distinct from new.position;
  elsif new.role = 'player'::public.team_role then
    insert into public.roster_players (team_id, user_id, name, position)
    select new.team_id, new.user_id,
           coalesce(nullif(btrim(p.display_name), ''), 'Player'),
           new.position
    from (select 1) one
    left join public.profiles p on p.user_id = new.user_id
    on conflict (team_id, user_id) do nothing;
  elsif tg_op = 'UPDATE' and old.role = 'player'::public.team_role then
    delete from public.roster_players where team_id = new.team_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger memberships_roster_sync
  after insert or update of role, position or delete on public.memberships
  for each row execute function app.sync_roster_from_membership();

-- Roster position change on a linked row flows back to the membership.
create function app.sync_membership_from_roster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null
     and new.position is distinct from old.position
     and pg_catalog.pg_trigger_depth() = 1 then
    update public.memberships set position = new.position
    where team_id = new.team_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger roster_players_membership_sync
  after update of position on public.roster_players
  for each row execute function app.sync_membership_from_roster();

-- Existing players.
insert into public.roster_players (team_id, user_id, name, position)
select m.team_id, m.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Player'), m.position
from public.memberships m
left join public.profiles p on p.user_id = m.user_id
where m.role = 'player'::public.team_role
on conflict (team_id, user_id) do nothing;

-- Depth chart slots and their side. Special teams are shared (null).
create function app.depth_slot_side(s text)
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

create table public.depth_chart (
  team_id uuid not null references public.teams on delete cascade,
  slot text not null check (
    slot in (
      'X', 'LT', 'LG', 'C', 'RG', 'RT', 'Y', 'Z', 'SL', 'QB', 'RB',
      'LCB', 'LDE', 'LDT', 'RDT', 'RDE', 'RCB', 'SAM', 'MIKE', 'WILL', 'SS', 'FS',
      'K', 'P', 'LS', 'HLD', 'KR', 'PR'
    )
  ),
  rank smallint not null check (rank between 1 and 6),
  roster_player_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, slot, rank),
  unique (team_id, slot, roster_player_id),
  foreign key (team_id, roster_player_id)
    references public.roster_players (team_id, id) on delete cascade
);

-- Replace one slot's order in a single statement. Security invoker: RLS decides.
create function public.set_depth(p_team uuid, p_slot text, p_players uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
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

-- Fold a typed-in row (no account) into an account holder's row: blanks on the kept row
-- take the typed-in values, depth spots move over, and the typed-in row is deleted.
create function public.merge_roster_players(p_keep uuid, p_drop uuid)
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
  -- Moving depth spots is a depth chart edit: the caller needs the side of every slot
  -- the typed-in player holds, exactly as set_depth would require.
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

alter table public.roster_players enable row level security;
alter table public.depth_chart enable row level security;

create policy roster_select on public.roster_players
  for select to authenticated
  using (app.is_staff(team_id));
create policy roster_insert on public.roster_players
  for insert to authenticated
  with check (app.is_staff(team_id));
create policy roster_update on public.roster_players
  for update to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));
create policy roster_delete on public.roster_players
  for delete to authenticated
  using (app.is_staff(team_id));

-- The OC sets offense depth, the DC defense depth; special teams are shared.
create policy depth_select on public.depth_chart
  for select to authenticated
  using (app.is_staff(team_id));
create policy depth_insert on public.depth_chart
  for insert to authenticated
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, app.depth_slot_side(slot)));
create policy depth_update on public.depth_chart
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.depth_slot_side(slot)))
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, app.depth_slot_side(slot)));
create policy depth_delete on public.depth_chart
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.depth_slot_side(slot)));

revoke all on function app.guard_roster_player() from public, anon, authenticated, service_role;
revoke all on function app.sync_roster_from_membership() from public, anon, authenticated, service_role;
revoke all on function app.sync_membership_from_roster() from public, anon, authenticated, service_role;
revoke all on function public.set_depth(uuid, text, uuid[]) from public, anon;
revoke all on function public.merge_roster_players(uuid, uuid) from public, anon;
grant execute on function public.merge_roster_players(uuid, uuid) to authenticated, service_role;
grant execute on function public.set_depth(uuid, text, uuid[]) to authenticated, service_role;
revoke all on function app.depth_slot_side(text) from public, anon;
grant execute on function app.depth_slot_side(text) to authenticated, service_role;

revoke all on table public.roster_players, public.depth_chart from public, anon, authenticated;
grant select, insert, delete on table public.roster_players to authenticated;
grant update (name, jersey, position, alt_positions, grad_year, height_in, weight_lb, notes, user_id)
  on table public.roster_players to authenticated;
grant select, insert, delete on table public.depth_chart to authenticated;
grant all on table public.roster_players, public.depth_chart to service_role;

commit;
