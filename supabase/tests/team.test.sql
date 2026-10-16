-- New team SQL, exercised as role authenticated (not the superuser).
begin;
select plan(49);
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

create function pg_temp.act(uid uuid, email text)
returns text
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated', 'email', email)::text,
    true
  );
  return email;
end;
$$;

do $$
begin
  perform pg_temp.make_user('a1111111-1111-4111-8111-111111111111', 'owner@demo.local');
  perform pg_temp.make_user('a2222222-2222-4222-8222-222222222222', 'cohead@demo.local');
  perform pg_temp.make_user('a3333333-3333-4333-8333-333333333333', 'cold@demo.local');
  perform pg_temp.make_user('a4444444-4444-4444-8444-444444444444', 'player@demo.local');
end $$;
update auth.users
set raw_user_meta_data = '{"display_name":"Hacked","coach":true}'::jsonb
where id = 'a1111111-1111-4111-8111-111111111111';
update auth.users
set email_confirmed_at = null
where id = 'a3333333-3333-4333-8333-333333333333';

select has_function('public', 'create_team', array['text', 'text', 'text', 'text', 'date'], 'create_team exists');
select has_function(
  'public',
  'create_invite',
  array['uuid', 'text', 'text', 'team_role', 'position_code', 'text'],
  'create_invite exists'
);
select ok(
  not has_function_privilege('anon', 'public.create_team(text,text,text,text,date)', 'execute'),
  'anon cannot create a team'
);
select ok(
  has_function_privilege('authenticated', 'public.create_team(text,text,text,text,date)', 'execute'),
  'authenticated can create a team'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_invite(uuid,text,text,team_role,position_code,text)',
    'execute'
  ),
  'anon cannot create an invite'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_invite(uuid,text,text,team_role,position_code,text)',
    'execute'
  ),
  'authenticated can create an invite'
);

set local role authenticated;

select is(pg_temp.act('a3333333-3333-4333-8333-333333333333', 'cold@demo.local'), 'cold@demo.local', 'act as unconfirmed');
select throws_ok(
  $$select public.create_team('Cold', '', '', 'NFHS', '2026-11-30')$$,
  'P0001',
  'confirm your email first',
  'an unconfirmed coach cannot create a team'
);

select is(pg_temp.act('a1111111-1111-4111-8111-111111111111', 'owner@demo.local'), 'owner@demo.local', 'act as owner');
select throws_ok(
  $$select public.create_team('Nope', '', '', 'HIGH SCHOOL', '2026-11-30')$$,
  'P0001',
  'hash rule must be NFHS or NCAA',
  'hash rule is NFHS or NCAA'
);
select ok(
  (
    select public.create_team('Lone Peak Knights 2026', 'Lone Peak', '2026', 'NFHS', '2026-11-30')
  ) is not null,
  'create_team returns an id'
);
select is(
  (select role::text from public.memberships where user_id = 'a1111111-1111-4111-8111-111111111111'),
  'head_coach',
  'the founder is head coach'
);
select is(
  (select created_by::text from public.teams where name = 'Lone Peak Knights 2026'),
  'a1111111-1111-4111-8111-111111111111',
  'the founder is the owner'
);
select is(
  (select display_name from public.profiles where user_id = 'a1111111-1111-4111-8111-111111111111'),
  'owner',
  'the profile name comes from the login email, not user_metadata'
);
select is(
  (select count(*)::int from public.invites where email = 'owner@demo.local'),
  0,
  'the founder does not join through an invite'
);
select throws_ok(
  $$select public.create_team('Second', '', '', 'NFHS', '2026-11-30')$$,
  'P0001',
  'you already have a team',
  'a member cannot create another team'
);
select throws_ok(
  $$select public.create_invite(
    (select id from public.teams where name = 'Lone Peak Knights 2026'),
    'player@demo.local', 'Sam Lee', 'player', 'WR', ''
  )$$,
  'P0001',
  'confirm consent to invite a player',
  'a player invite requires consent'
);

select is(
  length(set_config(
    'pov.cohead',
    public.create_invite(
      (select id from public.teams where name = 'Lone Peak Knights 2026'),
      'cohead@demo.local', 'Casey', 'head_coach', null, ''
    ),
    true
  )),
  64,
  'the owner can invite a head coach'
);
select is(pg_temp.act('a2222222-2222-4222-8222-222222222222', 'cohead@demo.local'), 'cohead@demo.local', 'act as co-head');
select is(
  public.accept_invite(current_setting('pov.cohead'))::text,
  'a2222222-2222-4222-8222-222222222222',
  'a head coach joins through public.accept_invite'
);
select throws_ok(
  $$select public.create_invite(
    (select id from public.teams where name = 'Lone Peak Knights 2026'),
    'extra@demo.local', 'Extra', 'head_coach', null, ''
  )$$,
  'P0001',
  'only the team owner can add a head coach',
  'a co-head cannot invite a head coach'
);

select is(pg_temp.act('a1111111-1111-4111-8111-111111111111', 'owner@demo.local'), 'owner@demo.local', 'act as owner again');
select is(
  length(set_config(
    'pov.player',
    public.create_invite(
      (select id from public.teams where name = 'Lone Peak Knights 2026'),
      'player@demo.local',
      'Sam Lee',
      'player',
      'WR',
      'I confirm this player''s parent/guardian or school has consented to this account'
    ),
    true
  )),
  64,
  'create_invite returns the raw token once'
);
select ok(current_setting('pov.player') ~ '^[0-9a-f]{64}$', 'the token is 64 hex characters');
select is(
  (select token_hash from public.invites where email = 'player@demo.local' and accepted_at is null),
  extensions.digest(pg_catalog.decode(current_setting('pov.player'), 'hex'), 'sha256'),
  'the invite stores sha256 of the 32-byte token'
);
select is(
  (select octet_length(token_hash) from public.invites where email = 'player@demo.local' and accepted_at is null),
  32,
  'token_hash is 32 bytes'
);
select ok(
  (
    select expires_at from public.invites
    where email = 'player@demo.local' and accepted_at is null
  ) <= pg_catalog.now() + interval '14 days'
  and (
    select expires_at from public.invites
    where email = 'player@demo.local' and accepted_at is null
  ) > pg_catalog.now() + interval '6 days',
  'expiry stays inside the 7-day default and the 14-day cap'
);
select is(
  (select attester_kind from public.consent_records where subject_email = 'player@demo.local'),
  'head_coach',
  'a head coach records the consent'
);
select is(
  (select statement_version from public.consent_records where subject_email = 'player@demo.local'),
  'consent-v0-provisional',
  'player consent uses consent-v0-provisional'
);

select is(pg_temp.act('a4444444-4444-4444-8444-444444444444', 'player@demo.local'), 'player@demo.local', 'act as player');
select is(
  public.accept_invite(current_setting('pov.player'))::text,
  'a4444444-4444-4444-8444-444444444444',
  'a player joins only through public.accept_invite'
);
select is(
  (select position::text from public.memberships where user_id = 'a4444444-4444-4444-8444-444444444444'),
  'WR',
  'the accepted player is WR'
);
select throws_ok(
  $$insert into public.memberships (team_id, user_id, role)
    select id, 'a5555555-5555-4555-8555-555555555555', 'player'
    from public.teams where name = 'Lone Peak Knights 2026'$$,
  '42501',
  'new row violates row-level security policy for table "memberships"',
  'a direct membership insert is rejected'
);
select throws_ok(
  $$select public.create_invite(
    (select id from public.teams where name = 'Lone Peak Knights 2026'),
    'extra@demo.local', 'Extra', 'player', 'WR',
    'I confirm this player''s parent/guardian or school has consented to this account'
  )$$,
  'P0001',
  'not allowed',
  'a player cannot invite'
);

select is(pg_temp.act('a1111111-1111-4111-8111-111111111111', 'owner@demo.local'), 'owner@demo.local', 'act as owner for edits');
select throws_ok(
  $$select public.create_invite(
    (select id from public.teams where name = 'Lone Peak Knights 2026'),
    'player@demo.local', 'Sam Lee', 'player', 'WR',
    'I confirm this player''s parent/guardian or school has consented to this account'
  )$$,
  'P0001',
  'Already on the roster',
  'an email already on the roster is refused'
);
select lives_ok(
  $$update public.memberships set position = 'TE', role = 'player'
    where user_id = 'a4444444-4444-4444-8444-444444444444'$$,
  'the owner can change role and position'
);
select is(
  (select position::text from public.memberships where user_id = 'a4444444-4444-4444-8444-444444444444'),
  'TE',
  'the roster position is TE'
);
select throws_ok(
  $$update public.memberships
    set user_id = 'a2222222-2222-4222-8222-222222222222'
    where user_id = 'a4444444-4444-4444-8444-444444444444'$$,
  '42501',
  'permission denied for table memberships',
  'authenticated cannot change memberships.user_id'
);

select is(pg_temp.act('a2222222-2222-4222-8222-222222222222', 'cohead@demo.local'), 'cohead@demo.local', 'act as co-head for promote');
select throws_ok(
  $$update public.memberships set role = 'head_coach'
    where user_id = 'a4444444-4444-4444-8444-444444444444'$$,
  'P0001',
  'only the team owner can promote a head coach',
  'only the owner can promote a head coach'
);

select is(pg_temp.act('a1111111-1111-4111-8111-111111111111', 'owner@demo.local'), 'owner@demo.local', 'act as owner for revoke');
select ok(
  length(public.create_invite(
    (select id from public.teams where name = 'Lone Peak Knights 2026'),
    'pending@demo.local', 'Pat', 'coach', null, ''
  )) = 64,
  'an open coach invite returns a token'
);
select is(pg_temp.act('a4444444-4444-4444-8444-444444444444', 'player@demo.local'), 'player@demo.local', 'act as player for revoke');
select lives_ok(
  $$delete from public.invites where email = 'pending@demo.local'$$,
  'a player delete does not raise'
);
select is(pg_temp.act('a1111111-1111-4111-8111-111111111111', 'owner@demo.local'), 'owner@demo.local', 'act as owner to revoke');
select is(
  (select count(*)::int from public.invites where email = 'pending@demo.local'),
  1,
  'a player cannot revoke an invite'
);
select lives_ok(
  $$delete from public.invites where email = 'pending@demo.local'$$,
  'the head coach can delete the open invite'
);
select is(
  (select count(*)::int from public.invites where email = 'pending@demo.local'),
  0,
  'the open invite is revoked'
);

select * from finish();
rollback;
