-- Formation templates: a team's own offense and defense formations, saved from the diagram
-- editor and used like the built-in presets (picker, playbook base alignment, Facing strip).
-- Rollback (not applied by supabase db push): supabase/down/20261201000000_formation_templates.sql
--
-- `spots` is the app's Preset spots: eleven of { slot, dx, dy, label?, color? }, `dx` yards
-- downfield from the line (negative is the offense's backfield), `dy` yards toward the
-- offense's left. Slots are the ones the built-in presets use, per side.
--
-- Staff read their team's templates; players and other teams see nothing. Writes follow
-- app.can_edit_side: an OC saves offense, a DC defense, the head coach and coaches with no
-- side save both. Templates are archived, never deleted, so a playbook whose base alignment
-- is `tpl:<id>` keeps resolving it. Archived templates free their name for reuse.

begin;

-- Same slot names as OFFENSE_PRESETS and DEFENSE_PRESETS in src/diagram/presets.ts.
create function app.template_slots(s text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'offense' then array[
      'lt', 'lg', 'c', 'rg', 'rt', 'qb', 'rb', 'fb', 'x', 'z', 'y', 'h', 't', 's'
    ]
    when 'defense' then array[
      'de1', 'dt1', 'dt2', 'de2', 'nt', 'w', 'm', 's', 'n', 'm1', 'm2', 'i1', 'i2',
      'cb1', 'cb2', 'fs', 'ss'
    ]
    else array[]::text[]
  end
$$;

-- True when `spots` is eleven well-formed spots with unique slots allowed on this side.
create function app.valid_template_spots(s text, spots jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  spot jsonb;
  slots text[] := array[]::text[];
  allowed text[] := app.template_slots(s);
begin
  if spots is null or jsonb_typeof(spots) <> 'array' or jsonb_array_length(spots) <> 11 then
    return false;
  end if;
  if pg_column_size(spots) > 8192 then
    return false;
  end if;
  for spot in select value from jsonb_array_elements(spots) loop
    if jsonb_typeof(spot) <> 'object' then
      return false;
    end if;
    -- Only the known keys.
    if exists (
      select 1 from jsonb_object_keys(spot) k
      where k not in ('slot', 'dx', 'dy', 'label', 'color')
    ) then
      return false;
    end if;
    if jsonb_typeof(spot -> 'slot') is distinct from 'string'
      or not ((spot ->> 'slot') = any (allowed))
      or (spot ->> 'slot') = any (slots) then
      return false;
    end if;
    slots := slots || (spot ->> 'slot');
    if jsonb_typeof(spot -> 'dx') is distinct from 'number'
      or jsonb_typeof(spot -> 'dy') is distinct from 'number' then
      return false;
    end if;
    if (spot ->> 'dx')::numeric not between -20 and 20
      or (spot ->> 'dy')::numeric not between -27 and 27 then
      return false;
    end if;
    if spot ? 'label' and (
      jsonb_typeof(spot -> 'label') <> 'string' or length(spot ->> 'label') > 6
    ) then
      return false;
    end if;
    if spot ? 'color' and (
      jsonb_typeof(spot -> 'color') <> 'string'
      or (spot ->> 'color') not in ('white', 'black', 'red', 'blue', 'green', 'orange', 'purple')
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.formation_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  side text not null check (side in ('offense', 'defense')),
  name text not null check (length(btrim(name)) between 1 and 40 and name = btrim(name)),
  spots jsonb not null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint formation_templates_spots_check check (app.valid_template_spots(side, spots))
);

-- One live name per team and side. An archived template no longer holds its name.
create unique index formation_templates_name_key
  on public.formation_templates (team_id, side, lower(name))
  where archived_at is null;

create index formation_templates_team_idx on public.formation_templates (team_id, side);

create function app.touch_formation_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id or new.side is distinct from old.side then
    raise exception 'team and side of a template are fixed' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger formation_templates_touch
  before update on public.formation_templates
  for each row execute function app.touch_formation_template();

revoke all on function app.touch_formation_template() from public, anon, authenticated, service_role;

alter table public.formation_templates enable row level security;

create policy ft_select on public.formation_templates
  for select to authenticated
  using (app.is_staff(team_id));
create policy ft_insert on public.formation_templates
  for insert to authenticated
  with check (
    app.is_staff(team_id)
    and app.can_edit_side(team_id, side)
    and created_by = auth.uid()
    and archived_at is null
  );
create policy ft_update on public.formation_templates
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side))
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
-- No delete policy: templates are archived so books that use one keep resolving it.

revoke all on table public.formation_templates from public, anon, authenticated;
grant select on table public.formation_templates to authenticated;
grant insert (id, team_id, side, name, spots) on table public.formation_templates to authenticated;
grant update (name, spots, archived_at) on table public.formation_templates to authenticated;
grant all on table public.formation_templates to service_role;

revoke all on function app.template_slots(text) from public, anon;
revoke all on function app.valid_template_spots(text, jsonb) from public, anon;
grant execute on function app.template_slots(text) to authenticated, service_role;
grant execute on function app.valid_template_spots(text, jsonb) to authenticated, service_role;

-- A playbook's base alignment can now be a team template: 'tpl:<uuid>'.
alter table public.playbooks drop constraint playbooks_base_formation_check;
alter table public.playbooks
  add constraint playbooks_base_formation_check
  check (
    base_formation is null
    or base_formation ~ '^[a-z0-9-]{1,40}$'
    or base_formation ~ '^tpl:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- A 'tpl:' base alignment must be a live offense template on the book's own team. Setting
-- it again to the value it already has is fine, so an archived template stays in place.
create function app.guard_base_formation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tpl_id uuid;
begin
  if new.base_formation is null or left(new.base_formation, 4) <> 'tpl:' then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.base_formation is not distinct from old.base_formation
    and new.team_id is not distinct from old.team_id then
    return new;
  end if;
  tpl_id := substr(new.base_formation, 5)::uuid;
  if not exists (
    select 1
    from public.formation_templates ft
    where ft.id = tpl_id
      and ft.team_id = new.team_id
      and ft.side = 'offense'
      and ft.archived_at is null
  ) then
    raise exception 'base alignment is not an offense formation on this team'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger playbooks_base_formation_guard
  before insert or update of base_formation, team_id on public.playbooks
  for each row execute function app.guard_base_formation();

revoke all on function app.guard_base_formation() from public, anon, authenticated, service_role;

commit;
