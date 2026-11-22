-- Scout packs per opponent, with sections delegated to position coaches (issue #49).
-- Rollback (not applied by supabase db push): supabase/down/20261202000000_scout_packs.sql
--
-- 1. Coach rooms: memberships.coach_groups, the position groups a coach runs (DL, LB, ...).
--    Set by the head coach on /team. Not tied to the player `position` column.
-- 2. A scout pack is a folder tree: Opponents > <Team> > <Week of ...> > sections.
--    The week folder is the pack. It carries playbooks.pack_week and the side of the unit
--    that studies the opponent (defense by default). A second week makes a second pack
--    folder next to the first, so nothing is overwritten.
-- 3. scout_tasks: one section folder delegated to one coach or one coach room, with a due
--    date and a status (todo, in_progress, ready). Staff only. Separate from assignments,
--    whose "assignee must be a player" rule stays as it is.
-- 4. Edit rights: a coach with a task edits that section folder and everything under it,
--    whatever its side (app.owns_section). Nothing outside it. Coaches without a task keep
--    the side rules (app.can_edit_side).
-- 5. Removing a coach, or making them a player, deletes the tasks assigned to them.

begin;

-- 1. Coach rooms.
alter table public.memberships
  add column coach_groups public.position_group[] not null default '{}';
alter table public.memberships
  add constraint memberships_coach_groups_staff
  check (cardinality(coach_groups) = 0 or role <> 'player'::public.team_role);

grant update (coach_groups) on table public.memberships to authenticated;

create function app.clear_player_coach_groups()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'player'::public.team_role then
    new.coach_groups := '{}';
  end if;
  return new;
end;
$$;

create trigger memberships_clear_coach_groups
  before insert or update of role on public.memberships
  for each row execute function app.clear_player_coach_groups();

revoke all on function app.clear_player_coach_groups() from public, anon, authenticated;

-- 2. The pack folder.
alter table public.playbooks add column pack_week date;

-- One live pack per opponent per week. An archived pack does not block a new one.
create unique index playbooks_pack_week_key
  on public.playbooks (parent_id, pack_week)
  where pack_week is not null and archived_at is null;

-- 3. Scout tasks.
create table public.scout_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  folder_id uuid not null references public.playbooks on delete cascade,
  -- Set when a section owner hands their section (or part of it) on, one level at a time.
  parent_task_id uuid references public.scout_tasks on delete cascade,
  assignee_user uuid references auth.users on delete cascade,
  assignee_group public.position_group,
  due_at timestamptz,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'ready')),
  note text check (length(note) <= 500),
  -- Who last changed the status, and when. Stamped by the database.
  status_by uuid references auth.users on delete set null,
  status_at timestamptz,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check ((assignee_user is null) <> (assignee_group is null))
);

create index scout_tasks_team_idx on public.scout_tasks (team_id);
create index scout_tasks_folder_idx on public.scout_tasks (folder_id);
create index scout_tasks_assignee_idx on public.scout_tasks (team_id, assignee_user);

-- True when the caller is a coach on team `t` and the task goes to them, or to a room
-- they run.
create function app.is_scout_assignee(t uuid, u uuid, g public.position_group)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.team_id = t
      and m.user_id = auth.uid()
      and m.role in ('head_coach'::public.team_role, 'coach'::public.team_role)
      and (m.user_id = u or (g is not null and g = any (m.coach_groups)))
  )
$$;

-- True when the caller has a scout task on folder `b` or on any folder above it.
create function app.owns_section(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up(id, parent_id, team_id, level) as (
    select id, parent_id, team_id, 1 from public.playbooks where id = b
    union all
    select pb.id, pb.parent_id, pb.team_id, up.level + 1
    from public.playbooks pb
    join up on pb.id = up.parent_id
    where up.level < 64
  )
  select exists (
    select 1
    from up
    join public.scout_tasks t on t.folder_id = up.id and t.team_id = up.team_id
    where app.is_scout_assignee(t.team_id, t.assignee_user, t.assignee_group)
  )
$$;

-- Side rights on the book, or a scout task on it or above it.
create function app.can_edit_book(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select app.can_edit_side(pb.team_id, app.book_side(pb.id)) or app.owns_section(pb.id)
    from public.playbooks pb
    where pb.id = b
  ), false)
$$;

-- True when `child` is `ancestor` or sits somewhere below it.
create function app.folder_within(child uuid, ancestor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up(id, parent_id, level) as (
    select id, parent_id, 1 from public.playbooks where id = child
    union all
    select pb.id, pb.parent_id, up.level + 1
    from public.playbooks pb
    join up on pb.id = up.parent_id
    where up.level < 64
  )
  select exists (select 1 from up where id = ancestor)
$$;

-- A play's rules are the section owner's to write when the play is filed in their section
-- and in no folder they can't edit. Filing another side's play in a section does not hand
-- over that play.
create function app.owns_play(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.playbook_plays pp
      where pp.play_id = p and app.owns_section(pp.playbook_id)
    )
    and not exists (
      select 1 from public.playbook_plays pp
      where pp.play_id = p and not app.can_edit_book(pp.playbook_id)
    )
$$;

-- Who may change or delete a task: whoever delegated it, or a coach with side rights on
-- the section (head coach, that side's coordinator, a coach with no side).
create function app.manages_scout_task(t uuid, f uuid, creator uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_staff(t)
    and (creator = auth.uid() or app.can_edit_side(t, app.book_side(f)))
$$;

revoke all on function app.is_scout_assignee(uuid, uuid, public.position_group) from public, anon;
revoke all on function app.owns_section(uuid) from public, anon;
revoke all on function app.can_edit_book(uuid) from public, anon;
revoke all on function app.folder_within(uuid, uuid) from public, anon;
revoke all on function app.owns_play(uuid) from public, anon;
revoke all on function app.manages_scout_task(uuid, uuid, uuid) from public, anon;
grant execute on function app.is_scout_assignee(uuid, uuid, public.position_group)
  to authenticated, service_role;
grant execute on function app.owns_section(uuid) to authenticated, service_role;
grant execute on function app.can_edit_book(uuid) to authenticated, service_role;
grant execute on function app.folder_within(uuid, uuid) to authenticated, service_role;
grant execute on function app.owns_play(uuid) to authenticated, service_role;
grant execute on function app.manages_scout_task(uuid, uuid, uuid) to authenticated, service_role;

-- Same-team folder, coach assignee, re-delegation inside the parent section, delegation
-- rights, and who may change what. Stamps who set the status.
create function app.guard_scout_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  folder_team uuid;
  member_role public.team_role;
  parent_team uuid;
  parent_folder uuid;
begin
  select team_id into folder_team from public.playbooks where id = new.folder_id;
  if folder_team is null or folder_team is distinct from new.team_id then
    raise exception 'section folder is not on this team' using errcode = '23514';
  end if;
  if new.assignee_user is not null then
    select role into member_role
    from public.memberships
    where team_id = new.team_id and user_id = new.assignee_user;
    if member_role is null or member_role = 'player'::public.team_role then
      raise exception 'assignee must be a coach on this team' using errcode = '23514';
    end if;
  end if;
  if new.parent_task_id is not null then
    select team_id, folder_id into parent_team, parent_folder
    from public.scout_tasks where id = new.parent_task_id;
    if parent_team is distinct from new.team_id then
      raise exception 'parent task is on another team' using errcode = '23514';
    end if;
    if not app.folder_within(new.folder_id, parent_folder) then
      raise exception 'a handed-on task stays inside the section it came from'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id
       or new.created_by is distinct from old.created_by
       or new.parent_task_id is distinct from old.parent_task_id then
      raise exception 'team, creator and parent task cannot change' using errcode = '42501';
    end if;
    if uid is not null
       and not app.manages_scout_task(old.team_id, old.folder_id, old.created_by)
       and (
         new.folder_id is distinct from old.folder_id
         or new.assignee_user is distinct from old.assignee_user
         or new.assignee_group is distinct from old.assignee_group
         or new.due_at is distinct from old.due_at
         or new.note is distinct from old.note
       ) then
      raise exception 'only the coach who delegated this section can reassign it'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      new.status_by := uid;
      new.status_at := pg_catalog.now();
    else
      new.status_by := old.status_by;
      new.status_at := old.status_at;
    end if;
  else
    if uid is not null then
      new.created_by := uid;
    end if;
    if new.status <> 'todo' then
      new.status_by := uid;
      new.status_at := pg_catalog.now();
    else
      new.status_by := null;
      new.status_at := null;
    end if;
  end if;

  -- Delegating needs side rights on the section, or owning it already (handing it on).
  if uid is not null
     and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id)
     and not (
       app.can_edit_side(new.team_id, app.book_side(new.folder_id))
       or app.owns_section(new.folder_id)
     ) then
    raise exception 'you can only delegate a section you can edit' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger scout_tasks_guard
  before insert or update on public.scout_tasks
  for each row execute function app.guard_scout_task();

revoke all on function app.guard_scout_task() from public, anon, authenticated;

alter table public.scout_tasks enable row level security;

-- Staff read every task on their team. Players and other teams read nothing.
create policy st_select on public.scout_tasks
  for select to authenticated
  using (app.is_staff(team_id));
create policy st_insert on public.scout_tasks
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and created_by = auth.uid()
    and (
      app.can_edit_side(team_id, app.book_side(folder_id))
      or app.owns_section(folder_id)
    )
  );
-- The assignee may update (status only, enforced by app.guard_scout_task); whoever
-- manages the task may change anything.
create policy st_update on public.scout_tasks
  for update to authenticated
  using (
    app.is_staff(team_id)
    and (
      app.manages_scout_task(team_id, folder_id, created_by)
      or app.is_scout_assignee(team_id, assignee_user, assignee_group)
    )
  )
  with check (app.is_staff(team_id));
create policy st_delete on public.scout_tasks
  for delete to authenticated
  using (app.manages_scout_task(team_id, folder_id, created_by));

revoke all on table public.scout_tasks from public, anon, authenticated;
grant select, insert, delete on table public.scout_tasks to authenticated;
grant update (folder_id, assignee_user, assignee_group, due_at, note, status)
  on table public.scout_tasks to authenticated;
grant all on table public.scout_tasks to service_role;

-- 4. Edit rights for section owners.
drop policy pb_insert on public.playbooks;
drop policy pb_update on public.playbooks;
drop policy pb_delete on public.playbooks;

-- A section owner adds folders inside their section. The new folder keeps the section's
-- side (or none), and is never a pack itself.
create policy pb_insert on public.playbooks
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and created_by = auth.uid()
    and (
      app.can_edit_side(team_id, coalesce(side, app.book_side(parent_id)))
      or (
        parent_id is not null
        and pack_week is null
        and app.owns_section(parent_id)
        and (side is null or side is not distinct from app.book_side(parent_id))
      )
    )
  );
-- app.guard_section_edit keeps a section owner's moves inside the section.
create policy pb_update on public.playbooks
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_book(id))
  with check (
    app.is_staff(team_id)
    and (
      app.can_edit_side(team_id, coalesce(side, app.book_side(parent_id)))
      or app.owns_section(id)
    )
  );
-- A section owner deletes folders inside the section, not the section itself.
create policy pb_delete on public.playbooks
  for delete to authenticated
  using (
    app.is_staff(team_id)
    and (
      app.can_edit_side(team_id, app.book_side(id))
      or (parent_id is not null and app.owns_section(parent_id))
    )
  );

-- Someone editing a folder only because of a scout task can rename it and work inside it,
-- but cannot change its side, move it out of the section, or move or archive the section
-- folder they were given.
create function app.guard_section_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or app.can_edit_side(old.team_id, app.book_side(old.id)) then
    return new;
  end if;
  if new.side is distinct from old.side then
    raise exception 'a delegated section keeps its side' using errcode = '42501';
  end if;
  if new.parent_id is distinct from old.parent_id
     and (new.parent_id is null or not app.owns_section(new.parent_id)) then
    raise exception 'a folder in a delegated section stays inside that section'
      using errcode = '42501';
  end if;
  if (old.parent_id is null or not app.owns_section(old.parent_id))
     and (
       new.archived_at is distinct from old.archived_at
       or new.parent_id is distinct from old.parent_id
     ) then
    raise exception 'only the coach who delegated this section can move or delete it'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger playbooks_section_guard
  before update of parent_id, side, archived_at on public.playbooks
  for each row execute function app.guard_section_edit();

revoke all on function app.guard_section_edit() from public, anon, authenticated;

drop policy pbp_write on public.playbook_plays;
create policy pbp_write on public.playbook_plays
  for all to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_book(book.id)
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_plays.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_book(book.id)
    )
  );

drop policy ps_write on public.playbook_scripts;
create policy ps_write on public.playbook_scripts
  for all to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_scripts.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_book(book.id)
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_scripts.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_book(book.id)
    )
  );

-- Position rules and their exceptions on plays charted in the section.
drop policy rules_insert on public.position_rules;
drop policy rules_update on public.position_rules;
drop policy rules_delete on public.position_rules;
create policy rules_insert on public.position_rules
  for insert to authenticated
  with check (
    app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id))
  );
create policy rules_update on public.position_rules
  for update to authenticated
  using (app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id)))
  with check (
    app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id))
  );
create policy rules_delete on public.position_rules
  for delete to authenticated
  using (app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id)));

drop policy variants_insert on public.position_rule_variants;
drop policy variants_update on public.position_rule_variants;
drop policy variants_delete on public.position_rule_variants;
create policy variants_insert on public.position_rule_variants
  for insert to authenticated
  with check (
    app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id))
  );
create policy variants_update on public.position_rule_variants
  for update to authenticated
  using (app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id)))
  with check (
    app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id))
  );
create policy variants_delete on public.position_rule_variants
  for delete to authenticated
  using (app.is_staff(team_id) and (app.can_edit_side(team_id, side) or app.owns_play(play_id)));

-- 5. A coach who leaves the team, or becomes a player, loses their tasks. Room tasks stay
-- for the rest of the room.
create function app.clear_coach_scout_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.scout_tasks where team_id = old.team_id and assignee_user = old.user_id;
    return old;
  end if;
  if new.role = 'player'::public.team_role and old.role <> 'player'::public.team_role then
    delete from public.scout_tasks where team_id = new.team_id and assignee_user = new.user_id;
  end if;
  return new;
end;
$$;

create trigger memberships_scout_cleanup
  after update of role or delete on public.memberships
  for each row execute function app.clear_coach_scout_tasks();

revoke all on function app.clear_coach_scout_tasks() from public, anon, authenticated;

-- 6. New scout pack, in one transaction. Runs as the caller, so the playbook policies
-- decide who may make it (a coordinator only makes packs on their own side).
create function public.create_scout_pack(
  p_team uuid,
  p_opponent text,
  p_week date,
  p_week_name text,
  p_side text,
  p_sections text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opponent text := pg_catalog.btrim(p_opponent);
  v_week_name text := pg_catalog.btrim(p_week_name);
  v_root uuid;
  v_team_folder uuid;
  v_pack uuid;
  v_section text;
begin
  if not app.is_staff(p_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_opponent is null or length(v_opponent) < 1 or length(v_opponent) > 80 then
    raise exception 'opponent name must be 1 to 80 characters' using errcode = '22023';
  end if;
  if p_week is null then
    raise exception 'pick the week' using errcode = '22023';
  end if;
  if v_week_name is null or length(v_week_name) < 1 or length(v_week_name) > 80 then
    raise exception 'week name must be 1 to 80 characters' using errcode = '22023';
  end if;
  if p_side is not null and p_side not in ('offense', 'defense', 'special') then
    raise exception 'side must be offense, defense or special' using errcode = '22023';
  end if;
  if p_sections is null or cardinality(p_sections) < 1 or cardinality(p_sections) > 12 then
    raise exception 'a pack has 1 to 12 sections' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_sections) s
    where s is null or length(pg_catalog.btrim(s)) < 1 or length(pg_catalog.btrim(s)) > 80
  ) then
    raise exception 'section names must be 1 to 80 characters' using errcode = '22023';
  end if;

  select id into v_root
  from public.playbooks
  where team_id = p_team and parent_id is null and archived_at is null
    and lower(name) = 'opponents'
  order by created_at
  limit 1;
  if v_root is null then
    insert into public.playbooks (team_id, name, kind)
    values (p_team, 'Opponents', 'opponent')
    returning id into v_root;
  end if;

  select id into v_team_folder
  from public.playbooks
  where team_id = p_team and parent_id = v_root and archived_at is null
    and lower(name) = lower(v_opponent)
  order by created_at
  limit 1;
  if v_team_folder is null then
    insert into public.playbooks (team_id, name, kind, parent_id)
    values (p_team, v_opponent, 'opponent', v_root)
    returning id into v_team_folder;
  end if;

  if exists (
    select 1 from public.playbooks
    where parent_id = v_team_folder and pack_week = p_week and archived_at is null
  ) then
    raise exception 'there is already a scout pack for % that week', v_opponent
      using errcode = '23505';
  end if;

  insert into public.playbooks (team_id, name, kind, parent_id, side, pack_week)
  values (p_team, v_week_name, 'opponent', v_team_folder, p_side, p_week)
  returning id into v_pack;

  foreach v_section in array p_sections loop
    insert into public.playbooks (team_id, name, kind, parent_id)
    values (p_team, pg_catalog.btrim(v_section), 'opponent', v_pack);
  end loop;

  return v_pack;
end;
$$;

revoke all on function public.create_scout_pack(uuid, text, date, text, text, text[])
  from public, anon;
grant execute on function public.create_scout_pack(uuid, text, date, text, text, text[])
  to authenticated, service_role;

commit;
