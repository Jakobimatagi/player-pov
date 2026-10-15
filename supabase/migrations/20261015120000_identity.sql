-- V1 identity: teams, profiles, memberships, invites, consent, roster_public.
-- Plays, watch events, create_team(), and can_view_play() land in later migrations.
-- roster_public keeps team_id and user_id (the DDL) plus display_name, position, and role.
-- It has no email column. Players read this view; they do not read memberships of teammates.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

create type public.team_role as enum ('head_coach', 'coach', 'player');
create type public.position_code as enum (
  'QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'ATH'
);
create type public.position_group as enum ('QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text,
  season text,
  hash_rule text not null default 'NFHS' check (hash_rule in ('NFHS', 'NCAA')),
  season_ends_on date not null,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  team_id uuid references public.teams on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role public.team_role not null,
  position public.position_code,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create function public.position_group_of(p public.position_code)
returns public.position_group
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'QB'::public.position_code then 'QB'
    when 'RB'::public.position_code then 'RB'
    when 'FB'::public.position_code then 'RB'
    when 'WR'::public.position_code then 'WR'
    when 'TE'::public.position_code then 'TE'
    when 'OL'::public.position_code then 'OL'
    when 'DL'::public.position_code then 'DL'
    when 'LB'::public.position_code then 'LB'
    when 'CB'::public.position_code then 'DB'
    when 'S'::public.position_code then 'DB'
    when 'K'::public.position_code then 'ST'
    else null
  end::public.position_group
$$;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  email extensions.citext not null,
  display_name text not null,
  role public.team_role not null,
  position public.position_code,
  invited_by uuid not null references auth.users,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  unique (team_id, email)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  invite_id uuid references public.invites on delete set null,
  user_id uuid references auth.users on delete set null,
  subject_email extensions.citext not null,
  attested_by uuid not null references auth.users,
  statement_version text not null,
  statement_text text not null,
  attested_at timestamptz not null default now()
);

create function app.my_role(t uuid)
returns public.team_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.memberships where team_id = t and user_id = auth.uid()
$$;

create function app.is_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.my_role(t) is not null
$$;

create function app.is_staff(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.my_role(t) in ('head_coach'::public.team_role, 'coach'::public.team_role)
$$;

create function app.is_head_coach(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.my_role(t) = 'head_coach'::public.team_role
$$;

-- Owner-rights view. It filters with is_member so a player sees teammates' names
-- without a select policy on their memberships or profiles.
create view public.roster_public
with (security_invoker = false) as
  select m.team_id, m.user_id, p.display_name, m.position, m.role
  from public.memberships m
  join public.profiles p using (user_id)
  where app.is_member(m.team_id);

create function app.guard_last_head_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  others int;
begin
  if tg_op = 'DELETE' then
    if old.role = 'head_coach'::public.team_role then
      select count(*) into others
      from public.memberships
      where team_id = old.team_id
        and role = 'head_coach'::public.team_role
        and user_id <> old.user_id;
      if others = 0 then
        raise exception 'cannot remove the last head coach';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.role = 'head_coach'::public.team_role
    and new.role is distinct from old.role
  then
    if old.user_id = auth.uid() then
      raise exception 'a head coach cannot change their own role';
    end if;
    if new.role is distinct from 'head_coach'::public.team_role then
      select count(*) into others
      from public.memberships
      where team_id = old.team_id
        and role = 'head_coach'::public.team_role
        and user_id <> old.user_id;
      if others = 0 then
        raise exception 'cannot demote the last head coach';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger memberships_last_head_coach
  before update or delete on public.memberships
  for each row execute function app.guard_last_head_coach();

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.consent_records enable row level security;

create policy teams_select on public.teams
  for select using (app.is_member(id));
create policy teams_update on public.teams
  for update using (app.is_head_coach(id))
  with check (app.is_head_coach(id));

create policy profiles_select_own on public.profiles
  for select using (user_id = auth.uid());
create policy profiles_select_staff on public.profiles
  for select using (
    exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.team_id = mine.team_id
      where mine.user_id = auth.uid()
        and mine.role in ('head_coach'::public.team_role, 'coach'::public.team_role)
        and theirs.user_id = profiles.user_id
    )
  );
create policy profiles_insert_own on public.profiles
  for insert with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy mem_select on public.memberships
  for select using (app.is_staff(team_id) or user_id = auth.uid());
create policy mem_admin on public.memberships
  for all using (app.is_head_coach(team_id))
  with check (app.is_head_coach(team_id));

create policy invites_select on public.invites
  for select using (app.is_head_coach(team_id));
create policy invites_insert on public.invites
  for insert with check (app.is_head_coach(team_id) and invited_by = auth.uid());
create policy invites_delete on public.invites
  for delete using (app.is_head_coach(team_id));

create policy consent_select on public.consent_records
  for select using (app.is_head_coach(team_id));

grant select on public.teams, public.profiles, public.memberships, public.invites, public.consent_records
  to anon, authenticated;
grant insert, update, delete on public.teams, public.profiles, public.memberships, public.invites, public.consent_records
  to authenticated;
grant all on public.teams, public.profiles, public.memberships, public.invites, public.consent_records
  to service_role;

revoke all on public.roster_public from public, anon;
grant select on public.roster_public to authenticated, service_role;

grant execute on function public.position_group_of(public.position_code) to anon, authenticated, service_role;
grant execute on function app.my_role(uuid) to anon, authenticated, service_role;
grant execute on function app.is_member(uuid) to anon, authenticated, service_role;
grant execute on function app.is_staff(uuid) to anon, authenticated, service_role;
grant execute on function app.is_head_coach(uuid) to anon, authenticated, service_role;
revoke all on function app.guard_last_head_coach() from public, anon, authenticated;
