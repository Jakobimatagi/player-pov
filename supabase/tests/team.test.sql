begin;
select plan(25);
set local search_path = public, extensions, auth;

create function pg_temp.make_user(uid uuid, email text, confirmed boolean)
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
    case when confirmed then now() else null end,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', email),
    now(), now(), '', '', '', ''
  );
end;
$$;

do $$
begin
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'newcoach@example.com', true);
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'unconfirmed@example.com', false);
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', 'assistant@example.com', true);
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', 'fs@example.com', true);
end $$;

select is(
  set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', true)
    || set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02","role":"authenticated"}', true),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02","role":"authenticated"}',
  'act as unconfirmed coach'
);
set local role authenticated;
set local search_path = public, extensions, auth;

select throws_ok(
  $$select public.create_team('Nope', 'School', '2026', 'NFHS', '2026-11-30')$$,
  'P0001',
  'confirm your email first',
  'an unconfirmed user cannot create a team'
);

select is(
  set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', true)
    || set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","role":"authenticated"}', true),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","role":"authenticated"}',
  'act as confirmed coach'
);

-- create_team() has to run as its own statement. Inside the memberships
-- WHERE clause, memberships_user_id_idx finds no row for this user, so
-- Postgres never calls the function and no team is created.
do $$
begin
  perform public.create_team('Knights', 'Demo High', '2026', 'NFHS', '2026-11-30');
end $$;

select is(
  (
    select role from public.memberships
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
      and team_id = (select id from public.teams where name = 'Knights')
  ),
  'head_coach'::public.team_role,
  'create_team makes the caller head coach'
);

select lives_ok(
  $$select public.create_team('Second', null, '2026', 'NCAA', '2026-11-30')$$,
  'a second team is allowed'
);
select lives_ok(
  $$select public.create_team('Third', null, '2026', 'NFHS', '2026-11-30')$$,
  'a third team is allowed'
);
select throws_ok(
  $$select public.create_team('Fourth', null, '2026', 'NFHS', '2026-11-30')$$,
  'P0001',
  'a fourth team is rejected',
  'a fourth team is rejected'
);

select throws_ok(
  $$select public.create_player_invite(
      (select team_id from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' limit 1),
      'fs@example.com', 'FS', 'player', 'S', false, null)$$,
  'P0001',
  'confirm consent to invite a player',
  'a player invite without consent fails'
);

select lives_ok(
  $$select public.create_player_invite(
      (select id from public.teams where name = 'Knights'),
      'fs@example.com', 'FS Player', 'player', 'S', true, null)$$,
  'a player invite with consent is stored'
);
select ok(
  exists (
    select 1 from public.consent_records
    where subject_email = 'fs@example.com' and statement_version = 'consent-v0-provisional'
  ),
  'a consent record exists for the player invite'
);

reset role;
set local search_path = public, extensions, auth;
insert into public.memberships (team_id, user_id, role)
select id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', 'coach'
from public.teams where name = 'Knights';
insert into public.memberships (team_id, user_id, role, position)
select id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', 'player', 'S'
from public.teams where name = 'Knights';

select is(
  set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', true)
    || set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03","role":"authenticated"}', true),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03","role":"authenticated"}',
  'act as assistant coach'
);
set local role authenticated;
set local search_path = public, extensions, auth;

select throws_ok(
  $$select public.create_player_invite(
      (select id from public.teams where name = 'Knights'),
      'other@example.com', 'Other', 'player', 'WR', true, null)$$,
  'P0001',
  'not allowed',
  'an assistant coach cannot invite'
);

do $$
begin
  begin
    insert into public.memberships (team_id, user_id, role)
    select id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'player'
    from public.teams where name = 'Knights';
    raise exception 'coach inserted a membership';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;
select ok(true, 'an assistant coach cannot insert memberships');

select is(
  set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', true)
    || set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","role":"authenticated"}', true),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","role":"authenticated"}',
  'act as head coach again'
);
select throws_ok(
  $$select public.remove_member(
      (select id from public.teams where name = 'Knights'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01')$$,
  'P0001',
  'cannot remove the last head coach',
  'the only head coach cannot remove themselves'
);
select throws_ok(
  $$select public.update_member(
      (select id from public.teams where name = 'Knights'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
      'coach', null)$$,
  'P0001',
  'cannot remove the last head coach',
  'the only head coach cannot demote themselves'
);
select lives_ok(
  $$select public.update_member(
      (select id from public.teams where name = 'Knights'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
      'player', 'TE')$$,
  'head coach can change a position'
);
select is(
  (
    select position from public.memberships
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04'
  ),
  'TE'::public.position_code,
  'position is now TE'
);
select lives_ok(
  $$select public.revoke_invite(
      (select id from public.invites where email = 'fs@example.com'))$$,
  'head coach can revoke a pending invite'
);
select ok(
  (
    select expires_at < now() from public.invites where email = 'fs@example.com'
  ),
  'a revoked invite is already expired'
);

reset role;
set local search_path = public, extensions, auth;
select is(
  set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', true)
    || set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04","role":"authenticated"}', true),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04","role":"authenticated"}',
  'act as invited player'
);
set local role authenticated;
set local search_path = public, extensions, auth;
select throws_ok(
  $$select public.accept_invite((select id from public.invites where email = 'fs@example.com'))$$,
  'P0001',
  'This invite is no longer valid',
  'a revoked invite cannot be accepted'
);

reset role;
set local search_path = public, extensions, auth;
select is(
  set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', true)
    || set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","role":"authenticated"}', true),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","role":"authenticated"}',
  'act as head coach to delete'
);
set local role authenticated;
set local search_path = public, extensions, auth;
select lives_ok(
  $$select public.delete_member_data(
      (select id from public.teams where name = 'Knights'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04')$$,
  'head coach can delete a player'
);
select is(
  (select count(*)::int from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04'),
  0,
  'deleted player has no membership rows'
);

select * from finish();
rollback;
