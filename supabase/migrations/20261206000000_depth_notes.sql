-- Depth chart notes: coach feedback on a roster player, kept as a thread.
-- Rollback (not applied by supabase db push): supabase/down/20261206000000_depth_notes.sql
--
-- Every staff member on the team reads and writes notes on any player (feedback, not a
-- depth change, so the side rules for set_depth do not apply). Editing, sharing and
-- deleting are limited to the note's author or the head coach.
--
-- A note is staff-only until a coach turns on "Share with player" (shared = true). A
-- player never reads depth_notes or depth_chart directly: my_depth_spots and
-- my_depth_notes return only their own spots and their own shared notes.
--
-- roster_players.notes stays the private staff notes column and is not touched here.
--
-- Notes hang off the roster row, so they follow it: a typed-in player's notes stay
-- coach-only until the row is linked to an account (user_id) or merged into the account
-- holder's row (merge_roster_players moves them), and removing the membership deletes
-- the roster row and, by cascade, its notes.

begin;

create table public.depth_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  roster_player_id uuid not null,
  -- A note about one position, or null for a general note.
  slot text check (slot is null or app.depth_slot_side(slot) is not null),
  body text not null check (length(btrim(body)) between 1 and 1000),
  shared boolean not null default false,
  -- When the player could first read this version: set on share and on an edit while
  -- shared. Drives the "new" marker on Player Home. Null while staff-only.
  shared_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, roster_player_id)
    references public.roster_players (team_id, id) on delete cascade
);

create index depth_notes_player_idx on public.depth_notes (team_id, roster_player_id, created_at);

-- Stamps author and times. Clients cannot pick the author, the dates or shared_at.
create function app.guard_depth_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := pg_catalog.now();
    new.shared_at := case when new.shared then pg_catalog.now() end;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if not new.shared then
      new.shared_at := null;
    elsif not old.shared or new.body is distinct from old.body then
      new.shared_at := pg_catalog.now();
    else
      new.shared_at := old.shared_at;
    end if;
  end if;
  new.body := pg_catalog.btrim(new.body);
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger depth_notes_guard
  before insert or update on public.depth_notes
  for each row execute function app.guard_depth_note();

alter table public.depth_notes enable row level security;

create policy depth_notes_select on public.depth_notes
  for select to authenticated
  using (app.is_staff(team_id));
create policy depth_notes_insert on public.depth_notes
  for insert to authenticated
  with check (app.is_staff(team_id) and created_by = auth.uid());
create policy depth_notes_update on public.depth_notes
  for update to authenticated
  using (app.is_staff(team_id) and (created_by = auth.uid() or app.is_head_coach(team_id)))
  with check (app.is_staff(team_id) and (created_by = auth.uid() or app.is_head_coach(team_id)));
create policy depth_notes_delete on public.depth_notes
  for delete to authenticated
  using (app.is_staff(team_id) and (created_by = auth.uid() or app.is_head_coach(team_id)));

-- Staff view of the team's notes with author names. A note by someone who has left the
-- team keeps its text; the name falls back to 'Former staff'.
create function public.team_depth_notes(p_team uuid)
returns table (
  id uuid,
  roster_player_id uuid,
  slot text,
  body text,
  shared boolean,
  shared_at timestamptz,
  created_by uuid,
  author_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.roster_player_id, n.slot, n.body, n.shared, n.shared_at, n.created_by,
         coalesce(
           (select nullif(btrim(p.display_name), '') from public.profiles p
             join public.memberships m on m.user_id = p.user_id and m.team_id = n.team_id
            where p.user_id = n.created_by),
           'Former staff'
         ),
         n.created_at, n.updated_at
  from public.depth_notes n
  where n.team_id = p_team
    and app.is_staff(p_team)
  order by n.created_at
$$;

-- A player's own depth spots on a team: slot, rank (1 = starter) and how many deep.
create function public.my_depth_spots(p_team uuid)
returns table (slot text, rank smallint, depth int)
language sql
stable
security definer
set search_path = ''
as $$
  select d.slot, d.rank,
         (select count(*)::int from public.depth_chart x
           where x.team_id = d.team_id and x.slot = d.slot)
  from public.depth_chart d
  join public.roster_players r on r.team_id = d.team_id and r.id = d.roster_player_id
  where d.team_id = p_team
    and r.user_id = auth.uid()
    and auth.uid() is not null
  order by d.rank, d.slot
$$;

-- A player's own shared notes, oldest first, with the author's name.
create function public.my_depth_notes(p_team uuid)
returns table (
  id uuid,
  slot text,
  body text,
  author_name text,
  created_at timestamptz,
  updated_at timestamptz,
  shared_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slot, n.body,
         coalesce(
           (select nullif(btrim(p.display_name), '') from public.profiles p
             join public.memberships m on m.user_id = p.user_id and m.team_id = n.team_id
            where p.user_id = n.created_by),
           'Coach'
         ),
         n.created_at, n.updated_at, n.shared_at
  from public.depth_notes n
  join public.roster_players r on r.team_id = n.team_id and r.id = n.roster_player_id
  where n.team_id = p_team
    and n.shared
    and r.user_id = auth.uid()
    and auth.uid() is not null
  order by n.created_at
$$;

-- Merging a typed-in row into an account holder's row now brings its depth notes along.
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
  -- Notes keep their author, dates and share state; they now belong to the kept row.
  update public.depth_notes set roster_player_id = p_keep where roster_player_id = p_drop;
  delete from public.roster_players where id = p_drop;
end;
$$;

revoke all on function app.guard_depth_note() from public, anon, authenticated, service_role;
revoke all on function public.team_depth_notes(uuid) from public, anon;
revoke all on function public.my_depth_spots(uuid) from public, anon;
revoke all on function public.my_depth_notes(uuid) from public, anon;
revoke all on function public.merge_roster_players(uuid, uuid) from public, anon;
grant execute on function public.team_depth_notes(uuid) to authenticated, service_role;
grant execute on function public.my_depth_spots(uuid) to authenticated, service_role;
grant execute on function public.my_depth_notes(uuid) to authenticated, service_role;
grant execute on function public.merge_roster_players(uuid, uuid) to authenticated, service_role;

revoke all on table public.depth_notes from public, anon, authenticated;
grant select, delete on table public.depth_notes to authenticated;
grant insert (team_id, roster_player_id, slot, body, shared) on table public.depth_notes
  to authenticated;
grant update (slot, body, shared) on table public.depth_notes to authenticated;
grant all on table public.depth_notes to service_role;

commit;
