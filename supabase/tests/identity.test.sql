begin;
select plan(65);
set local search_path = public, extensions, auth;

do $do$
begin
  if to_regprocedure('auth.jwt()') is null then
    execute $fn$
      create function auth.jwt()
      returns jsonb
      language sql
      stable
      as $body$
        select nullif(current_setting('request.jwt.claims', true), '')::jsonb
      $body$
    $fn$;
  end if;
end
$do$;

create function pg_temp.token_hash(token text)
returns bytea
language sql
as $$
  select extensions.digest(pg_catalog.decode(token, 'hex'), 'sha256')
$$;

create function pg_temp.make_user(uid uuid, email text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    uid, 'authenticated', 'authenticated', email,
    extensions.crypt('password1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (
    user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    uid,
    jsonb_build_object('sub', uid::text, 'email', email, 'email_verified', true),
    'email',
    uid::text,
    now(), now(), now()
  );
end;
$$;

create function pg_temp.team_a_hidden(team_a uuid, members uuid[])
returns boolean
language plpgsql
as $$
declare
  r record;
  n int;
  known boolean;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    known := false;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.relname and column_name = 'team_id'
    ) then
      execute format('select count(*) from public.%I where team_id = $1', r.relname)
        into n using team_a;
      known := true;
    elsif r.relname = 'teams' then
      execute 'select count(*) from public.teams where id = $1' into n using team_a;
      known := true;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.relname and column_name = 'user_id'
    ) then
      execute format('select count(*) from public.%I where user_id = any($1)', r.relname)
        into n using members;
      known := true;
    end if;

    if known and n <> 0 then
      raise exception 't2 saw % rows in %', n, r.relname;
    end if;

    if not known then
      execute format('select count(*) from public.%I', r.relname) into n;
      if n <> 0 then
        raise exception 't2 can read % rows from unclassified public table %', n, r.relname;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

select has_table('public', 'teams', 'teams exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'memberships', 'memberships exists');
select has_table('public', 'invites', 'invites exists');
select has_table('public', 'consent_records', 'consent_records exists');
select has_view('public', 'roster_public', 'roster_public exists');

select results_eq(
  $$select e.enumlabel::text collate "C"
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'team_role'
    order by e.enumsortorder$$,
  $$values ('head_coach'::text collate "C"), ('coach'::text collate "C"), ('player'::text collate "C")$$,
  'team_role is head_coach, coach, player'
);

select results_eq(
  $$select column_name::text collate "C" from information_schema.columns
    where table_schema = 'public' and table_name = 'roster_public'
    order by 1$$,
  $$values ('display_name'::text collate "C"), ('position'::text collate "C"), ('role'::text collate "C"), ('team_id'::text collate "C"), ('user_id'::text collate "C")$$,
  'roster_public columns are the DDL set and include no email'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ),
  'profiles has no email column'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  'RLS is enabled on every public table'
);

select is(public.position_group_of('FB'), 'RB'::public.position_group, 'FB maps to RB');
select is(public.position_group_of('CB'), 'DB'::public.position_group, 'CB maps to DB');
select is(public.position_group_of('K'), 'ST'::public.position_group, 'K maps to ST');

do $$
begin
  perform pg_temp.make_user('11111111-1111-4111-8111-111111111111', 't1@example.com');
  perform pg_temp.make_user('22222222-2222-4222-8222-222222222222', 'c1@example.com');
  perform pg_temp.make_user('33333333-3333-4333-8333-333333333333', 'pqb@example.com');
  perform pg_temp.make_user('44444444-4444-4444-8444-444444444444', 'pfs@example.com');
  perform pg_temp.make_user('55555555-5555-4555-8555-555555555555', 't2@example.com');
  perform pg_temp.make_user('66666666-6666-4666-8666-666666666666', 'h2@example.com');
  perform pg_temp.make_user('77777777-7777-4777-8777-777777777777', 'good@example.com');
end $$;

insert into public.teams (id, name, season, hash_rule, season_ends_on, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team A', '2026', 'NFHS', '2026-11-30', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Team B', '2026', 'NFHS', '2026-11-30', '55555555-5555-4555-8555-555555555555');

insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Head Coach'),
  ('22222222-2222-4222-8222-222222222222', 'Coach One'),
  ('33333333-3333-4333-8333-333333333333', 'QB Player'),
  ('44444444-4444-4444-8444-444444444444', 'FS Player'),
  ('55555555-5555-4555-8555-555555555555', 'Other Coach');

insert into public.memberships (team_id, user_id, role, position) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'head_coach', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'coach', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'player', 'QB'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'player', 'S'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'head_coach', null);

insert into public.invites (team_id, email, display_name, role, token_hash, invited_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'pending@example.com',
  'Pending',
  'player',
  pg_temp.token_hash('1111111111111111111111111111111111111111111111111111111111111111'),
  '11111111-1111-4111-8111-111111111111'
);

insert into public.consent_records (
  team_id, subject_email, attested_by, statement_version, statement_text
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'pending@example.com',
  '11111111-1111-4111-8111-111111111111',
  'consent-v0-provisional',
  'I confirm this player''s parent/guardian or school has consented to this account'
);

-- Assertion 10: a player sees only their membership row, and the roster has no email.
select is(
  set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true)
    || set_config('request.jwt.claim.role', 'authenticated', true)
    || set_config(
      'request.jwt.claims',
      '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
      true
    ),
  '33333333-3333-4333-8333-333333333333authenticated{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  'act as p_qb'
);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  (select count(*)::int from public.memberships),
  1,
  'p_qb sees exactly one membership row'
);
select is(
  (select user_id from public.memberships),
  '33333333-3333-4333-8333-333333333333'::uuid,
  'p_qb sees only their own membership'
);
select is(
  (select count(*)::int from public.roster_public),
  4,
  'roster_public returns all of team A'
);
select is(
  (select count(*)::int from public.roster_public where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'p_qb does not see team B on the roster'
);

do $$
begin
  begin
    execute 'select email from auth.users';
    raise exception 'player read auth.users';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;
select ok(true, 'a player cannot read auth.users');

-- Assertion 4: t1 can invite and remove c1, but not themselves.
select is(
  set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true)
    || set_config(
      'request.jwt.claims',
      '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
      true
    ),
  '11111111-1111-4111-8111-111111111111{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  'act as t1'
);

select lives_ok(
  $$insert into public.invites (team_id, email, display_name, role, token_hash, invited_by)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'new@example.com',
      'New Coach',
      'coach',
      pg_temp.token_hash('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      '11111111-1111-4111-8111-111111111111'
    )$$,
  't1 can insert an invite'
);
select is(
  (select count(*)::int from public.invites where email = 'new@example.com'),
  1,
  't1 can read the invite they inserted'
);

select throws_ok(
  $$update public.memberships
    set user_id = '77777777-7777-4777-8777-777777777777'
    where user_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501',
  'permission denied for table memberships',
  'authenticated cannot update membership user_id'
);
select throws_ok(
  $$update public.memberships
    set team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    where user_id = '33333333-3333-4333-8333-333333333333'$$,
  '42501',
  'permission denied for table memberships',
  'authenticated cannot update membership team_id'
);
select throws_ok(
  $$update public.teams
    set created_by = '55555555-5555-4555-8555-555555555555'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501',
  'permission denied for table teams',
  't1 cannot change teams.created_by'
);
select lives_ok(
  $$update public.teams set name = 'Team A renamed'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  't1 can rename the team'
);
select lives_ok(
  $$update public.memberships set position = 'QB'
    where user_id = '33333333-3333-4333-8333-333333333333'$$,
  'a head coach can update position'
);

select throws_ok(
  $$insert into public.memberships (team_id, user_id, role)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '77777777-7777-4777-8777-777777777777',
      'player'
    )$$,
  '42501',
  'new row violates row-level security policy for table "memberships"',
  'direct insert into memberships is denied'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invites' and column_name = 'token'
  )
  and not exists (
    select 1 from public.invites
    where invites::text like '%aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%'
  ),
  'the raw token is not stored'
);

select throws_ok(
  $$insert into public.invites (team_id, email, display_name, role, token_hash, invited_by)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'new@example.com',
      'Again',
      'player',
      pg_temp.token_hash('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      '11111111-1111-4111-8111-111111111111'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "invites_pending_team_email_idx"',
  'a second open invite for the same team and email is rejected'
);

select is(
  (select attested_email::text from public.consent_records where subject_email = 'pending@example.com'),
  't1@example.com',
  'consent stores the attesting email'
);

select lives_ok(
  $$delete from public.memberships
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '22222222-2222-4222-8222-222222222222'$$,
  't1 delete of c1 is allowed'
);
select is(
  (select count(*)::int from public.memberships where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  't1 removed c1'
);

select throws_ok(
  $$delete from public.memberships
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '11111111-1111-4111-8111-111111111111'$$,
  'P0001',
  'cannot remove the last head coach',
  't1 cannot remove the last head coach'
);
select throws_ok(
  $$update public.memberships set role = 'coach'
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '11111111-1111-4111-8111-111111111111'$$,
  'P0001',
  'a head coach cannot change their own role',
  't1 cannot change their own role'
);

-- Assertion 9: the removed member's jwt sees nothing on the next query.
select is(
  set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true)
    || set_config(
      'request.jwt.claims',
      '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
      true
    ),
  '22222222-2222-4222-8222-222222222222{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  'act as removed c1'
);
select is(
  (select count(*)::int from public.memberships),
  0,
  'removed c1 sees zero membership rows'
);

-- Assertion 5: t2 sees zero rows of team A in every public table.
select is(
  set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true)
    || set_config(
      'request.jwt.claims',
      '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
      true
    ),
  '55555555-5555-4555-8555-555555555555{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  'act as t2'
);
select ok(
  pg_temp.team_a_hidden(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    array[
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444'
    ]::uuid[]
  ),
  't2 sees zero rows of team A in every public table'
);

-- Co-head coaches cannot demote or remove each other. The owner can.
reset role;
insert into public.profiles (user_id, display_name)
values ('66666666-6666-4666-8666-666666666666', 'Co Head');
insert into public.memberships (team_id, user_id, role)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '66666666-6666-4666-8666-666666666666',
  'head_coach'
);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true)
    || set_config(
      'request.jwt.claims',
      '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","email":"h2@example.com"}',
      true
    ),
  '66666666-6666-4666-8666-666666666666{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","email":"h2@example.com"}',
  'act as co-head h2'
);
select throws_ok(
  $$update public.memberships set role = 'coach'
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '11111111-1111-4111-8111-111111111111'$$,
  'P0001',
  'only the team owner can change a head coach',
  'a co-head cannot demote another head coach'
);
select throws_ok(
  $$delete from public.memberships
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '11111111-1111-4111-8111-111111111111'$$,
  'P0001',
  'only the team owner can remove a head coach',
  'a co-head cannot remove another head coach'
);
select throws_ok(
  $$update public.memberships set role = 'head_coach'
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'only the team owner can promote a head coach',
  'a co-head cannot promote a member to head coach'
);

select is(
  set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true)
    || set_config(
      'request.jwt.claims',
      '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"t1@example.com"}',
      true
    ),
  '11111111-1111-4111-8111-111111111111{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"t1@example.com"}',
  'act as owner t1'
);
select lives_ok(
  $$update public.memberships set role = 'head_coach'
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '33333333-3333-4333-8333-333333333333'$$,
  'the owner can promote a member to head coach'
);
select lives_ok(
  $$update public.memberships set role = 'player'
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '33333333-3333-4333-8333-333333333333'$$,
  'the owner can return that member to player'
);
select lives_ok(
  $$update public.memberships set role = 'coach'
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '66666666-6666-4666-8666-666666666666'$$,
  'the owner can demote a co-head'
);
select is(
  (
    select role::text from public.memberships
    where user_id = '66666666-6666-4666-8666-666666666666'
  ),
  'coach',
  'the co-head is now a coach'
);

-- accept_invite: wrong email, expired, missing consent, then a single use.
reset role;
select throws_ok(
  $$update public.memberships
    set team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    where user_id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'membership user_id and team_id cannot change',
  'a trigger rejects a membership team_id change'
);
insert into public.invites (team_id, email, display_name, role, token_hash, invited_by)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'other@example.com',
    'Wrong',
    'player',
    pg_temp.token_hash('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'expired@example.com',
    'Expired',
    'player',
    pg_temp.token_hash('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'noconsent@example.com',
    'No Consent',
    'player',
    pg_temp.token_hash('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'good@example.com',
    'Good Player',
    'player',
    pg_temp.token_hash('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'noinviter@example.com',
    'No Inviter',
    'player',
    pg_temp.token_hash('abababababababababababababababababababababababababababababababab'),
    null
  );
update public.invites
set expires_at = now() - interval '1 day'
where email = 'expired@example.com';
insert into public.consent_records (
  team_id, subject_email, attested_by, statement_version, statement_text
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'other@example.com',
    '11111111-1111-4111-8111-111111111111',
    'consent-v0-provisional',
    'I confirm this player''s parent/guardian or school has consented to this account'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'good@example.com',
    '11111111-1111-4111-8111-111111111111',
    'consent-v0-provisional',
    'I confirm this player''s parent/guardian or school has consented to this account'
  );
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true)
    || set_config(
      'request.jwt.claims',
      '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"good@example.com"}',
      true
    ),
  '77777777-7777-4777-8777-777777777777{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"good@example.com"}',
  'act as invitee'
);
select throws_ok(
  $$select public.accept_invite('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')$$,
  'P0001',
  'invite email does not match',
  'accept_invite fails for the wrong email'
);
select is(
  set_config(
    'request.jwt.claims',
    '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"expired@example.com"}',
    true
  ),
  '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"expired@example.com"}',
  'jwt email is the expired invite'
);
select throws_ok(
  $$select public.accept_invite('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd')$$,
  'P0001',
  'invite expired',
  'accept_invite fails for an expired invite'
);
select is(
  set_config(
    'request.jwt.claims',
    '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"noconsent@example.com"}',
    true
  ),
  '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"noconsent@example.com"}',
  'jwt email is the invite with no consent'
);
select throws_ok(
  $$select public.accept_invite('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')$$,
  'P0001',
  'consent record required',
  'accept_invite fails when the consent record is missing'
);
select is(
  set_config(
    'request.jwt.claims',
    '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"good@example.com"}',
    true
  ),
  '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","email":"good@example.com"}',
  'jwt email is the open invite'
);
select throws_ok(
  $$select public.accept_invite('abababababababababababababababababababababababababababababababab')$$,
  'P0001',
  'invite has no inviter',
  'accept_invite rejects an invite with no inviter'
);
select lives_ok(
  $$select public.accept_invite('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')$$,
  'public.accept_invite joins the matching invitee'
);
select is(
  (
    select role::text from public.memberships
    where user_id = '77777777-7777-4777-8777-777777777777'
  ),
  'player',
  'accept_invite inserted the membership'
);
select throws_ok(
  $$select public.accept_invite('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')$$,
  'P0001',
  'invite already accepted',
  'accept_invite fails when the invite is reused'
);

reset role;
select pg_temp.make_user('88888888-8888-4888-8888-888888888888', 'owner3@example.com');
select pg_temp.make_user('99999999-9999-4999-8999-999999999999', 'early3@example.com');
select pg_temp.make_user('12121212-1212-4121-8121-121212121212', 'late3@example.com');
insert into public.teams (id, name, season, hash_rule, season_ends_on, created_by) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Team C',
  '2026',
  'NFHS',
  '2026-11-30',
  '88888888-8888-4888-8888-888888888888'
);
insert into public.memberships (team_id, user_id, role, created_at) values
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '88888888-8888-4888-8888-888888888888',
    'head_coach',
    now()
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '99999999-9999-4999-8999-999999999999',
    'head_coach',
    now() - interval '2 days'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '12121212-1212-4121-8121-121212121212',
    'head_coach',
    now() - interval '1 day'
  );
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
delete from auth.users where id = '88888888-8888-4888-8888-888888888888';
select is(
  (select created_by from public.teams where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  '99999999-9999-4999-8999-999999999999'::uuid,
  'deleting the owner transfers the team to the earliest remaining head coach'
);
select ok(
  has_function_privilege('authenticated', 'public.accept_invite(text)', 'execute')
    and not has_function_privilege('anon', 'public.accept_invite(text)', 'execute'),
  'public.accept_invite is granted to authenticated and not anon'
);

select is(
  set_config('request.jwt.claim.sub', '', true) || set_config('request.jwt.claims', '', true),
  '',
  'clear jwt before anon'
);
set local role anon;
set local search_path = public, extensions, auth;
select throws_ok(
  $$select count(*) from public.memberships$$,
  '42501',
  'permission denied for table memberships',
  'anon has no grant on memberships'
);
select throws_ok(
  $$select public.accept_invite('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')$$,
  '42501',
  'permission denied for function accept_invite',
  'anon cannot execute public.accept_invite'
);

select * from finish();
rollback;
