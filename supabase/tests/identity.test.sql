begin;
select plan(32);
set local search_path = public, extensions, auth;

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

insert into public.invites (team_id, email, display_name, role, invited_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'pending@example.com',
  'Pending',
  'player',
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
  $$insert into public.invites (team_id, email, display_name, role, invited_by)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'new@example.com',
      'New Coach',
      'coach',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  't1 can insert an invite'
);
select is(
  (select count(*)::int from public.invites where email = 'new@example.com'),
  1,
  't1 can read the invite they inserted'
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

select is(
  set_config('request.jwt.claim.sub', '', true) || set_config('request.jwt.claims', '', true),
  '',
  'clear jwt before anon'
);
set local role anon;
set local search_path = public, extensions, auth;
select is(
  (select count(*)::int from public.memberships),
  0,
  'anon select of memberships returns no rows'
);

select * from finish();
rollback;
