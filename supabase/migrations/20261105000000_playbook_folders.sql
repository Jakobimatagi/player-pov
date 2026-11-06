-- Playbook folders: a playbook can sit inside another playbook, and each one is
-- either our own playbook or a scouted opponent.
-- Rollback (not applied by supabase db push): supabase/down/20261105000000_playbook_folders.sql

alter table public.playbooks
  add column parent_id uuid references public.playbooks on delete cascade,
  add column kind text not null default 'playbook'
    check (kind in ('playbook', 'opponent'));

create index playbooks_parent_idx on public.playbooks (parent_id);

-- A folder's parent is on the same team, the tree has no cycles, and it is at
-- most 8 levels deep.
create function app.guard_playbook_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_team uuid;
  depth int;
  loops boolean;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'a folder cannot contain itself' using errcode = '23514';
  end if;
  select team_id into parent_team from public.playbooks where id = new.parent_id;
  if parent_team is distinct from new.team_id then
    raise exception 'parent folder is on another team' using errcode = '23514';
  end if;
  with recursive up(id, parent_id, level) as (
    select id, parent_id, 1 from public.playbooks where id = new.parent_id
    union all
    select pb.id, pb.parent_id, up.level + 1
    from public.playbooks pb
    join up on pb.id = up.parent_id
    where up.level < 64
  )
  select max(level), coalesce(bool_or(id = new.id), false) into depth, loops from up;
  if loops then
    raise exception 'a folder cannot move inside its own subfolder' using errcode = '23514';
  end if;
  if depth >= 8 then
    raise exception 'folders nest at most 8 deep' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger playbooks_parent_guard
  before insert or update of parent_id, team_id on public.playbooks
  for each row execute function app.guard_playbook_parent();

revoke all on function app.guard_playbook_parent() from public, anon, authenticated, service_role;

-- True when the caller is assigned this folder or any folder above it, and no
-- folder from here to the top is archived.
create function app.assigned_book(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain(id, parent_id, team_id, archived_at, level) as (
    select id, parent_id, team_id, archived_at, 1 from public.playbooks where id = b
    union all
    select pb.id, pb.parent_id, pb.team_id, pb.archived_at, chain.level + 1
    from public.playbooks pb
    join chain on pb.id = chain.parent_id
    where chain.level < 64
  )
  select not exists (select 1 from chain where archived_at is not null)
    and exists (
      select 1
      from chain
      join public.assignment_targets at
        on at.playbook_id = chain.id
       and at.team_id = chain.team_id
      where at.user_id = auth.uid()
    )
$$;

revoke all on function app.assigned_book(uuid) from public, anon;
grant execute on function app.assigned_book(uuid) to authenticated, service_role;

create or replace function app.can_view_play(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plays pl
    where pl.id = p
      and pl.archived_at is null
      and (
        app.is_staff(pl.team_id)
        or exists (
          select 1
          from public.playbook_plays pp
          join public.playbooks pb on pb.id = pp.playbook_id and pb.team_id = pl.team_id
          where pp.play_id = p
            and app.assigned_book(pb.id)
        )
      )
  )
$$;

drop policy pb_select on public.playbooks;
create policy pb_select on public.playbooks
  for select to authenticated
  using (app.is_staff(team_id) or app.assigned_book(id));

grant update (parent_id, kind) on table public.playbooks to authenticated;
