-- Coordinators own a side of the ball, playbooks carry a side, and each play holds
-- per-position rules (alignment, assignment, key, notes) keyed by the play's player id.
-- Rollback (not applied by supabase db push): supabase/down/20261121000000_coordinators_position_rules.sql
--
-- Edit rights by side (app.can_edit_side):
--   head coach                  -> both sides
--   coach coordinating offense  -> offense only
--   coach coordinating defense  -> defense only
--   coach with no side          -> both sides (unchanged from before this migration)
--   player                      -> nothing

begin;

-- 1. Coordinator side on a staff membership.
alter table public.memberships
  add column coordinates text check (coordinates in ('offense', 'defense'));
alter table public.memberships
  add constraint memberships_coordinates_staff
  check (coordinates is null or role <> 'player'::public.team_role);

grant update (coordinates) on table public.memberships to authenticated;

-- Becoming a player clears any coordinator side, so update_member can still demote.
create function app.clear_player_coordinates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'player'::public.team_role then
    new.coordinates := null;
  end if;
  return new;
end;
$$;

create trigger memberships_clear_coordinates
  before insert or update of role on public.memberships
  for each row execute function app.clear_player_coordinates();

revoke all on function app.clear_player_coordinates() from public, anon, authenticated;

-- The head coach guard skips coordinator-only changes. Changing a head coach's role,
-- position or identity still needs the owner, exactly as before.
drop trigger memberships_last_head_coach on public.memberships;
create trigger memberships_last_head_coach
  before update of user_id, team_id, role, position or delete on public.memberships
  for each row execute function app.guard_last_head_coach();

create function app.my_side(t uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coordinates from public.memberships where team_id = t and user_id = auth.uid()
$$;

create function app.can_edit_side(t uuid, s text)
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

revoke all on function app.my_side(uuid) from public, anon;
revoke all on function app.can_edit_side(uuid, text) from public, anon;
grant execute on function app.my_side(uuid) to authenticated, service_role;
grant execute on function app.can_edit_side(uuid, text) to authenticated, service_role;

-- 2. Playbooks belong to a side. Null is a shared book (any staff with edit rights).
-- A folder with no side of its own takes the nearest side above it.
alter table public.playbooks
  add column side text check (side in ('offense', 'defense'));

create function app.book_side(b uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up(id, parent_id, side, level) as (
    select id, parent_id, side, 1 from public.playbooks where id = b
    union all
    select pb.id, pb.parent_id, pb.side, up.level + 1
    from public.playbooks pb
    join up on pb.id = up.parent_id
    where up.side is null and up.level < 64
  )
  select side from up where side is not null order by level limit 1
$$;

revoke all on function app.book_side(uuid) from public, anon;
grant execute on function app.book_side(uuid) to authenticated, service_role;

grant update (side) on table public.playbooks to authenticated;

drop policy pb_insert on public.playbooks;
drop policy pb_update on public.playbooks;
drop policy pb_delete on public.playbooks;

create policy pb_insert on public.playbooks
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and app.can_edit_side(team_id, coalesce(side, app.book_side(parent_id)))
    and created_by = auth.uid()
  );
-- USING checks the effective side before the change, WITH CHECK the side after it, so
-- a coordinator cannot take over the other side's book by flipping or moving it.
create policy pb_update on public.playbooks
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.book_side(id)))
  with check (
    app.is_staff(team_id)
    and app.can_edit_side(team_id, coalesce(side, app.book_side(parent_id)))
  );
create policy pb_delete on public.playbooks
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, app.book_side(id)));

-- Filing plays in a book follows the book's side too.
drop policy pbp_write on public.playbook_plays;
create policy pbp_write on public.playbook_plays
  for all to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  );

create index playbooks_team_side_idx on public.playbooks (team_id, side);

-- 3. Position rules: what one player in a play does.
create table public.position_rules (
  play_id uuid not null references public.plays on delete cascade,
  slot text not null check (length(slot) between 1 and 32),
  team_id uuid not null references public.teams on delete cascade,
  -- Side of the player in the play, read from the current version. Not client-set.
  side text not null check (side in ('offense', 'defense')),
  alignment text check (length(alignment) <= 280),
  assignment text check (length(assignment) <= 500),
  key_read text check (length(key_read) <= 280),
  notes text check (length(notes) <= 1000),
  updated_by uuid default auth.uid() references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  primary key (play_id, slot)
);

-- Stamps team and side from the play and rejects a slot the play does not have.
create function app.stamp_position_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  play_team uuid;
  compiled jsonb;
  slot_side text;
begin
  select pl.team_id, pv.compiled into play_team, compiled
  from public.plays pl
  left join public.play_versions pv
    on pv.play_id = pl.id and pv.version = pl.current_version
  where pl.id = new.play_id;
  if play_team is null then
    raise exception 'play not found' using errcode = '23503';
  end if;
  select p ->> 'team' into slot_side
  from jsonb_array_elements(coalesce(compiled -> 'players', '[]'::jsonb)) p
  where p ->> 'id' = new.slot
  limit 1;
  if slot_side is null then
    raise exception 'this play has no player %', new.slot using errcode = '23514';
  end if;
  new.team_id := play_team;
  new.side := slot_side;
  new.updated_by := auth.uid();
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger position_rules_stamp
  before insert or update on public.position_rules
  for each row execute function app.stamp_position_rule();

revoke all on function app.stamp_position_rule() from public, anon, authenticated, service_role;

alter table public.position_rules enable row level security;

-- Anyone who can view the play reads every rule on it: players see teammates' jobs too.
create policy rules_select on public.position_rules
  for select to authenticated
  using (app.can_view_play(play_id) or app.is_staff(team_id));
create policy rules_insert on public.position_rules
  for insert to authenticated
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy rules_update on public.position_rules
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side))
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy rules_delete on public.position_rules
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side));

revoke all on table public.position_rules from public, anon, authenticated;
grant select, insert, delete on table public.position_rules to authenticated;
grant update (alignment, assignment, key_read, notes) on table public.position_rules
  to authenticated;
grant all on table public.position_rules to service_role;

commit;
