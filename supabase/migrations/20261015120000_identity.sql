-- V1 identity: teams, profiles, memberships, invites, consent, roster_public.
-- Plays, watch events, create_team(), and can_view_play() land in later migrations.
-- roster_public keeps team_id and user_id (the DDL) plus display_name, position, and role.
-- It has no email column. Players read this view; they do not read memberships of teammates.
-- Rollback (not applied by supabase db push): supabase/down/20261015120000_identity.sql

begin;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

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
  created_by uuid references auth.users on delete set null,
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

-- token_hash is sha256 of 32 random bytes. The raw token is never stored.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  email extensions.citext not null,
  display_name text not null,
  role public.team_role not null,
  position public.position_code,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  invited_by uuid references auth.users on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create unique index invites_token_hash_idx on public.invites (token_hash);
create unique index invites_pending_team_email_idx
  on public.invites (team_id, email)
  where accepted_at is null;

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  invite_id uuid references public.invites on delete set null,
  user_id uuid references auth.users on delete set null,
  subject_email extensions.citext not null,
  attested_by uuid references auth.users on delete set null,
  attested_email extensions.citext not null,
  -- Null today. Later: 'head_coach' or 'parent'. No parent flow yet.
  attester_kind text check (attester_kind is null or attester_kind in ('head_coach', 'parent')),
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

create function app.is_owner(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams
    where id = t and created_by = auth.uid()
  )
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
  -- Account deletion cascades with no jwt. That is not a coach removing a head coach.
  if tg_op = 'DELETE' and auth.uid() is null then
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.team_id is distinct from old.team_id
  ) then
    raise exception 'membership user_id and team_id cannot change';
  end if;

  if tg_op = 'UPDATE'
    and old.role is distinct from 'head_coach'::public.team_role
    and new.role = 'head_coach'::public.team_role
    and not app.is_owner(old.team_id)
  then
    raise exception 'only the team owner can promote a head coach';
  end if;

  if old.role <> 'head_coach'::public.team_role then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.user_id = auth.uid()
    and new.role is distinct from old.role
  then
    raise exception 'a head coach cannot change their own role';
  end if;

  if not app.is_owner(old.team_id) then
    if tg_op = 'DELETE' then
      raise exception 'only the team owner can remove a head coach';
    end if;
    raise exception 'only the team owner can change a head coach';
  end if;

  if tg_op = 'DELETE'
    or (tg_op = 'UPDATE' and new.role is distinct from 'head_coach'::public.team_role)
  then
    select count(*) into others
    from public.memberships
    where team_id = old.team_id
      and role = 'head_coach'::public.team_role
      and user_id <> old.user_id;
    if others = 0 then
      if tg_op = 'DELETE' then
        raise exception 'cannot remove the last head coach';
      end if;
      raise exception 'cannot demote the last head coach';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_last_head_coach
  before update or delete on public.memberships
  for each row execute function app.guard_last_head_coach();

-- ON DELETE SET NULL clears created_by. Hand the team to the earliest other head coach.
create function app.transfer_team_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_owner uuid;
begin
  if tg_op = 'UPDATE' and old.created_by is not null and new.created_by is null then
    select m.user_id into next_owner
    from public.memberships m
    where m.team_id = new.id
      and m.role = 'head_coach'::public.team_role
      and m.user_id is distinct from old.created_by
    order by m.created_at asc, m.user_id asc
    limit 1;
    if next_owner is not null then
      new.created_by := next_owner;
    end if;
  end if;
  return new;
end;
$$;

create trigger teams_transfer_owner
  before update of created_by on public.teams
  for each row execute function app.transfer_team_owner();

-- Clients may ask for a shorter window. Anything past 14 days is capped; a missing value is 7.
create function app.cap_invite_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.expires_at is null then
    new.expires_at := pg_catalog.now() + interval '7 days';
  elsif new.expires_at > pg_catalog.now() + interval '14 days' then
    new.expires_at := pg_catalog.now() + interval '14 days';
  end if;
  return new;
end;
$$;

create trigger invites_cap_expiry
  before insert or update of expires_at on public.invites
  for each row execute function app.cap_invite_expiry();

-- Copies the attester's login email onto the row. ON DELETE SET NULL clears
-- attested_by and leaves attested_email in place.
create function app.stamp_attested_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_email text;
begin
  if tg_op = 'INSERT' or new.attested_by is distinct from old.attested_by then
    if new.attested_by is not null then
      select u.email into found_email
      from auth.users u
      where u.id = new.attested_by;
      if found_email is not null then
        new.attested_email := found_email;
      end if;
    end if;
  end if;
  if new.attested_email is null then
    raise exception 'attesting email is required';
  end if;
  return new;
end;
$$;

create trigger consent_records_stamp_email
  before insert or update on public.consent_records
  for each row execute function app.stamp_attested_email();

-- token is the hex of 32 random bytes. Lookup uses sha256 of those bytes.
create function app.accept_invite(token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_bytes bytea;
  v_hash bytea;
  v_invite public.invites;
begin
  if v_uid is null or v_email is null or btrim(v_email) = '' then
    raise exception 'invite email does not match';
  end if;
  if not exists (
    select 1
    from auth.users u
    where u.id = v_uid
      and u.email_confirmed_at is not null
  ) then
    raise exception 'email is not confirmed';
  end if;

  begin
    v_bytes := pg_catalog.decode(token, 'hex');
  exception
    when others then
      raise exception 'invite not found';
  end;
  if v_bytes is null or octet_length(v_bytes) <> 32 then
    raise exception 'invite not found';
  end if;
  v_hash := extensions.digest(v_bytes, 'sha256');

  select * into v_invite
  from public.invites
  where token_hash = v_hash
  for update;

  if not found then
    raise exception 'invite not found';
  end if;
  if v_invite.invited_by is null then
    raise exception 'invite has no inviter';
  end if;
  if v_invite.email <> v_email::extensions.citext then
    raise exception 'invite email does not match';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite expired';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'invite already accepted';
  end if;
  if not exists (
    select 1
    from public.consent_records c
    where c.team_id = v_invite.team_id
      and c.subject_email = v_invite.email
  ) then
    raise exception 'consent record required';
  end if;
  if v_invite.role = 'head_coach'::public.team_role
    and not exists (
      select 1
      from public.teams t
      where t.id = v_invite.team_id
        and t.created_by is not distinct from v_invite.invited_by
    )
  then
    raise exception 'only the team owner can add a head coach';
  end if;

  insert into public.profiles (user_id, display_name)
  values (v_uid, v_invite.display_name)
  on conflict (user_id) do nothing;

  insert into public.memberships (team_id, user_id, role, position)
  values (v_invite.team_id, v_uid, v_invite.role, v_invite.position);

  update public.invites
  set accepted_at = now()
  where id = v_invite.id;

  update public.consent_records
  set user_id = v_uid,
      invite_id = coalesce(invite_id, v_invite.id)
  where team_id = v_invite.team_id
    and subject_email = v_invite.email
    and user_id is null;

  return v_uid;
end;
$$;

-- PostgREST exposes public. The body is app.accept_invite; authenticated is the only grantee.
create function public.accept_invite(token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.accept_invite(token)
$$;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.consent_records enable row level security;

create policy teams_select on public.teams
  for select to authenticated
  using (app.is_member(id));
create policy teams_update on public.teams
  for update to authenticated
  using (app.is_head_coach(id))
  with check (app.is_head_coach(id));

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid());
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (
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
  for insert to authenticated
  with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy mem_select on public.memberships
  for select to authenticated
  using (app.is_staff(team_id) or user_id = auth.uid());
-- Update and delete only. Rows are inserted by app.accept_invite.
create policy mem_admin on public.memberships
  for update to authenticated
  using (app.is_head_coach(team_id))
  with check (app.is_head_coach(team_id));
create policy mem_admin_delete on public.memberships
  for delete to authenticated
  using (app.is_head_coach(team_id));

create policy invites_select on public.invites
  for select to authenticated
  using (app.is_head_coach(team_id));
create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    app.is_head_coach(team_id)
    and invited_by = auth.uid()
    and (
      role <> 'head_coach'::public.team_role
      or app.is_owner(team_id)
    )
  );
create policy invites_delete on public.invites
  for delete to authenticated
  using (app.is_head_coach(team_id));

create policy consent_select on public.consent_records
  for select to authenticated
  using (app.is_head_coach(team_id));
create policy consent_insert on public.consent_records
  for insert to authenticated
  with check (app.is_head_coach(team_id) and attested_by = auth.uid());

revoke all on table
  public.teams,
  public.profiles,
  public.memberships,
  public.invites,
  public.consent_records
  from public, anon;
grant select, insert, update, delete on table
  public.teams,
  public.profiles,
  public.invites,
  public.consent_records
  to authenticated;
grant select, insert, delete on table public.memberships to authenticated;
revoke update on table public.memberships from authenticated;
grant update (role, position) on table public.memberships to authenticated;
grant all on table
  public.teams,
  public.profiles,
  public.memberships,
  public.invites,
  public.consent_records
  to service_role;

revoke all on table public.roster_public from public, anon;
grant select on table public.roster_public to authenticated, service_role;

revoke all on function public.position_group_of(public.position_code) from public;
grant execute on function public.position_group_of(public.position_code) to anon, authenticated, service_role;

revoke all on function app.my_role(uuid) from public, anon;
revoke all on function app.is_member(uuid) from public, anon;
revoke all on function app.is_staff(uuid) from public, anon;
revoke all on function app.is_head_coach(uuid) from public, anon;
revoke all on function app.is_owner(uuid) from public, anon;
revoke all on function app.accept_invite(text) from public, anon;
revoke all on function public.accept_invite(text) from public, anon, service_role;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function app.my_role(uuid) to authenticated, service_role;
grant execute on function app.is_member(uuid) to authenticated, service_role;
grant execute on function app.is_staff(uuid) to authenticated, service_role;
grant execute on function app.is_head_coach(uuid) to authenticated, service_role;
grant execute on function app.is_owner(uuid) to authenticated, service_role;
grant execute on function app.accept_invite(text) to authenticated, service_role;

revoke all on function app.guard_last_head_coach() from public, anon, authenticated;
revoke all on function app.stamp_attested_email() from public, anon, authenticated;
revoke all on function app.transfer_team_owner() from public, anon, authenticated;
revoke all on function app.cap_invite_expiry() from public, anon, authenticated;

commit;
