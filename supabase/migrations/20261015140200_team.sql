-- Team creation and hashed invites. Join stays public.accept_invite(text).
-- The founding head coach is inserted here. That is not a join.
-- Display names come from the login email.

begin;

create function app.create_team(
  p_name text,
  p_school text,
  p_season text,
  p_hash_rule text,
  p_season_ends_on date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail text;
  confirmed timestamptz;
  label text;
  team uuid;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'team name is required';
  end if;
  if p_hash_rule not in ('NFHS', 'NCAA') then
    raise exception 'hash rule must be NFHS or NCAA';
  end if;
  if p_season_ends_on is null then
    raise exception 'season end is required';
  end if;
  if exists (select 1 from public.memberships m where m.user_id = uid) then
    raise exception 'you already have a team';
  end if;

  select u.email, u.email_confirmed_at
  into mail, confirmed
  from auth.users u
  where u.id = uid;
  if mail is null or confirmed is null then
    raise exception 'confirm your email first';
  end if;

  label := split_part(mail, '@', 1);
  if label is null or btrim(label) = '' then
    label := 'Coach';
  end if;

  insert into public.teams (name, school, season, hash_rule, season_ends_on, created_by)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_school, '')), ''),
    nullif(btrim(coalesce(p_season, '')), ''),
    p_hash_rule,
    p_season_ends_on,
    uid
  )
  returning id into team;

  insert into public.profiles (user_id, display_name)
  values (uid, label)
  on conflict (user_id) do nothing;

  insert into public.memberships (team_id, user_id, role)
  values (team, uid, 'head_coach');

  return team;
end;
$$;

-- Returns the raw hex token once. The row stores only sha256 of those 32 bytes.
create function app.create_invite(
  p_team uuid,
  p_email text,
  p_name text,
  p_role public.team_role,
  p_position public.position_code,
  p_statement text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail text;
  v_email text := btrim(coalesce(p_email, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_statement text := btrim(coalesce(p_statement, ''));
  v_bytes bytea;
  v_hash bytea;
  v_token text;
  v_invite uuid;
begin
  if uid is null or not app.is_head_coach(p_team) then
    raise exception 'not allowed';
  end if;
  if p_role = 'head_coach'::public.team_role and not app.is_owner(p_team) then
    raise exception 'only the team owner can add a head coach';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'email is required';
  end if;
  if v_name = '' then
    raise exception 'name is required';
  end if;
  if p_role = 'player'::public.team_role and p_position is null then
    raise exception 'position is required';
  end if;
  if p_role = 'player'::public.team_role and v_statement = '' then
    raise exception 'confirm consent to invite a player';
  end if;
  if v_statement = '' then
    v_statement := 'Added by the head coach';
  end if;

  select u.email into mail from auth.users u where u.id = uid;
  if mail is null then
    raise exception 'not allowed';
  end if;

  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.team_id = p_team
      and u.email::extensions.citext = v_email::extensions.citext
  ) then
    raise exception 'Already on the roster';
  end if;

  v_bytes := extensions.gen_random_bytes(32);
  v_hash := extensions.digest(v_bytes, 'sha256');
  v_token := pg_catalog.encode(v_bytes, 'hex');

  insert into public.invites (
    team_id, email, display_name, role, position, token_hash, invited_by
  ) values (
    p_team, v_email, v_name, p_role, p_position, v_hash, uid
  )
  on conflict (team_id, email) where accepted_at is null
  do update set
    display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position,
    token_hash = excluded.token_hash,
    invited_by = excluded.invited_by,
    expires_at = pg_catalog.now() + interval '7 days'
  returning id into v_invite;

  insert into public.consent_records (
    team_id,
    invite_id,
    subject_email,
    attested_by,
    attested_email,
    attester_kind,
    statement_version,
    statement_text
  ) values (
    p_team,
    v_invite,
    v_email,
    uid,
    mail,
    'head_coach',
    case
      when p_role = 'player'::public.team_role then 'consent-v0-provisional'
      else 'staff-added-v0'
    end,
    v_statement
  );

  return v_token;
end;
$$;

create function public.create_team(
  p_name text,
  p_school text,
  p_season text,
  p_hash_rule text,
  p_season_ends_on date
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.create_team(p_name, p_school, p_season, p_hash_rule, p_season_ends_on)
$$;

create function public.create_invite(
  p_team uuid,
  p_email text,
  p_name text,
  p_role public.team_role,
  p_position public.position_code,
  p_statement text
) returns text
language sql
security invoker
set search_path = ''
as $$
  select app.create_invite(p_team, p_email, p_name, p_role, p_position, p_statement)
$$;

revoke all on function public.create_team(text, text, text, text, date) from public, anon, service_role;
revoke all on function public.create_invite(uuid, text, text, public.team_role, public.position_code, text) from public, anon, service_role;
grant execute on function public.create_team(text, text, text, text, date) to authenticated;
grant execute on function public.create_invite(uuid, text, text, public.team_role, public.position_code, text) to authenticated;

revoke all on function app.create_team(text, text, text, text, date) from public, anon;
revoke all on function app.create_invite(uuid, text, text, public.team_role, public.position_code, text) from public, anon;
grant execute on function app.create_team(text, text, text, text, date) to authenticated, service_role;
grant execute on function app.create_invite(uuid, text, text, public.team_role, public.position_code, text) to authenticated, service_role;

commit;
