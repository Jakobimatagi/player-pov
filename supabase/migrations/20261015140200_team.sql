-- Team creation, invites, and member deletion. The edge function calls create_player_invite.

create function public.create_team(
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
  confirmed timestamptz;
  teams int;
  team uuid;
  label text;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  if p_hash_rule not in ('NFHS', 'NCAA') then
    raise exception 'hash rule must be NFHS or NCAA';
  end if;
  select email_confirmed_at into confirmed from auth.users where id = uid;
  if confirmed is null then
    raise exception 'confirm your email first';
  end if;
  select count(*) into teams from public.memberships where user_id = uid;
  if teams >= 3 then
    raise exception 'a fourth team is rejected';
  end if;
  select coalesce(raw_user_meta_data->>'display_name', email, 'Coach')
    into label from auth.users where id = uid;
  insert into public.teams (name, school, season, hash_rule, season_ends_on, created_by)
  values (p_name, nullif(p_school, ''), nullif(p_season, ''), p_hash_rule, p_season_ends_on, uid)
  returning id into team;
  insert into public.profiles (user_id, display_name)
  values (uid, label)
  on conflict (user_id) do nothing;
  insert into public.memberships (team_id, user_id, role)
  values (team, uid, 'head_coach');
  return team;
end;
$$;

create function public.create_player_invite(
  p_team uuid,
  p_email text,
  p_name text,
  p_role public.team_role,
  p_position public.position_code,
  p_consent boolean,
  p_statement text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  invite uuid;
  statement text := coalesce(p_statement, 'I confirm this player''s parent/guardian or school has consented to this account');
begin
  if uid is null or not app.is_head_coach(p_team) then
    raise exception 'not allowed';
  end if;
  if p_role = 'player' and p_consent is not true then
    raise exception 'confirm consent to invite a player';
  end if;
  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.team_id = p_team and lower(u.email) = lower(p_email)
  ) then
    raise exception 'Already on the roster';
  end if;
  -- token_hash is required by the identity migration (20261015120000). This
  -- flow accepts by invite id after the auth email link, so the token is a
  -- random stand-in that also keeps the public.accept_invite(token) path
  -- from ever matching an invite it did not issue.
  insert into public.invites (team_id, email, display_name, role, position, invited_by, token_hash)
  values (
    p_team, p_email, p_name, p_role, p_position, uid,
    extensions.digest(extensions.gen_random_bytes(32), 'sha256')
  )
  on conflict (team_id, email) where accepted_at is null do update
    set display_name = excluded.display_name,
        role = excluded.role,
        position = excluded.position,
        invited_by = excluded.invited_by,
        token_hash = excluded.token_hash,
        expires_at = now() + interval '7 days',
        accepted_at = null
  returning id into invite;
  if p_role = 'player' then
    insert into public.consent_records (
      team_id, invite_id, subject_email, attested_by, statement_version, statement_text
    ) values (
      p_team, invite, p_email, uid, 'consent-v0-provisional', statement
    );
  end if;
  return invite;
end;
$$;

create function public.accept_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.invites%rowtype;
  mail text;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  select * into inv from public.invites where id = p_invite_id;
  select email into mail from auth.users where id = uid;
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now()
     or lower(inv.email::text) is distinct from lower(mail) then
    raise exception 'This invite is no longer valid';
  end if;
  if inv.role = 'player' and not exists (
    select 1 from public.consent_records where invite_id = inv.id
  ) then
    raise exception 'confirm consent to invite a player';
  end if;
  insert into public.profiles (user_id, display_name)
  values (uid, inv.display_name)
  on conflict (user_id) do nothing;
  insert into public.memberships (team_id, user_id, role, position)
  values (inv.team_id, uid, inv.role, inv.position)
  on conflict (team_id, user_id) do nothing;
  update public.invites set accepted_at = now() where id = inv.id;
  update public.consent_records set user_id = uid where invite_id = inv.id;
end;
$$;

create function public.delete_member_data(p_team uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  others int;
begin
  if uid is null or not app.is_head_coach(p_team) then
    raise exception 'not allowed';
  end if;
  select count(*) into others
  from public.memberships
  where team_id = p_team and role = 'head_coach' and user_id <> p_user;
  if exists (
    select 1 from public.memberships
    where team_id = p_team and user_id = p_user and role = 'head_coach'
  ) and others = 0 then
    raise exception 'cannot remove the last head coach';
  end if;
  delete from public.memberships where team_id = p_team and user_id = p_user;
  update public.consent_records set user_id = null
  where team_id = p_team and user_id = p_user;
  if not exists (select 1 from public.memberships where user_id = p_user) then
    delete from auth.users where id = p_user;
  end if;
end;
$$;

create function public.update_member(
  p_team uuid,
  p_user uuid,
  p_role public.team_role,
  p_position public.position_code
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  others int;
begin
  if uid is null or not app.is_head_coach(p_team) then
    raise exception 'not allowed';
  end if;
  if exists (
    select 1 from public.memberships
    where team_id = p_team and user_id = p_user and role = 'head_coach'
  ) and p_role is distinct from 'head_coach' then
    select count(*) into others
    from public.memberships
    where team_id = p_team and role = 'head_coach' and user_id <> p_user;
    if others = 0 then
      raise exception 'cannot remove the last head coach';
    end if;
  end if;
  update public.memberships
  set role = p_role, position = p_position
  where team_id = p_team and user_id = p_user;
  if not found then
    raise exception 'not allowed';
  end if;
end;
$$;

create function public.remove_member(p_team uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  others int;
begin
  if uid is null or not app.is_head_coach(p_team) then
    raise exception 'not allowed';
  end if;
  if exists (
    select 1 from public.memberships
    where team_id = p_team and user_id = p_user and role = 'head_coach'
  ) then
    select count(*) into others
    from public.memberships
    where team_id = p_team and role = 'head_coach' and user_id <> p_user;
    if others = 0 then
      raise exception 'cannot remove the last head coach';
    end if;
  end if;
  delete from public.memberships where team_id = p_team and user_id = p_user;
end;
$$;

create function public.revoke_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
begin
  select team_id into team from public.invites where id = p_invite;
  if team is null or not app.is_head_coach(team) then
    raise exception 'not allowed';
  end if;
  update public.invites
  set expires_at = now() - interval '1 minute'
  where id = p_invite;
end;
$$;

create function public.resend_invite(p_invite uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
  mail text;
begin
  select team_id, email::text into team, mail from public.invites where id = p_invite;
  if team is null or not app.is_head_coach(team) then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from public.invites where id = p_invite and accepted_at is not null) then
    raise exception 'This invite is no longer valid';
  end if;
  update public.invites
  set expires_at = now() + interval '7 days'
  where id = p_invite;
  return mail;
end;
$$;

create function public.invite_status(p_invite uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  mail text;
begin
  if auth.uid() is null then
    return 'invalid';
  end if;
  select * into inv from public.invites where id = p_invite;
  select email into mail from auth.users where id = auth.uid();
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now()
     or lower(inv.email::text) is distinct from lower(mail) then
    return 'invalid';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.create_team(text, text, text, text, date) from public;
revoke all on function public.create_player_invite(uuid, text, text, public.team_role, public.position_code, boolean, text) from public;
revoke all on function public.accept_invite(uuid) from public;
revoke all on function public.delete_member_data(uuid, uuid) from public;
grant execute on function public.create_team(text, text, text, text, date) to authenticated;
grant execute on function public.create_player_invite(uuid, text, text, public.team_role, public.position_code, boolean, text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.delete_member_data(uuid, uuid) to authenticated;
revoke all on function public.update_member(uuid, uuid, public.team_role, public.position_code) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
revoke all on function public.revoke_invite(uuid) from public;
revoke all on function public.resend_invite(uuid) from public;
revoke all on function public.invite_status(uuid) from public;
grant execute on function public.update_member(uuid, uuid, public.team_role, public.position_code) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.resend_invite(uuid) to authenticated;
grant execute on function public.invite_status(uuid) to authenticated;
