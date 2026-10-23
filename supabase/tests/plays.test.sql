begin;
select plan(36);
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
    jsonb_build_object('display_name', email),
    now(), now(), '', '', '', ''
  );
end;
$$;

do $$
begin
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 't1@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'c1@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'fs@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 't2@example.com');
end $$;

insert into public.teams (id, name, season_ends_on, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Team B', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');

insert into public.memberships (team_id, user_id, role, position) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'player', 'S'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null);

select is(
  set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true)
    || set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}',
  'act as coach'
);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  (
    select version from public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Flood',
      '{"side":"offense"}'::jsonb, '{"players":[{"waypoints":[1]}]}'::jsonb,
      'sum', 'test',
      null, null, '{"side":"defense","name":"Cover"}'::jsonb, 'look'
    )
  ),
  1,
  'coach creates a play at version 1'
);

select is(
  (
    select version from public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from public.plays where name = 'Flood'),
      1,
      'Flood',
      '{"side":"offense"}'::jsonb, '{"players":[{"waypoints":[1]}]}'::jsonb,
      'sum', 'test',
      (select default_look_id from public.plays where name = 'Flood'),
      1,
      '{"side":"defense","name":"Cover"}'::jsonb, 'look'
    )
  ),
  2,
  'coach save with the current version succeeds'
);

select throws_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from public.plays where name = 'Flood'),
      1,
      'Flood',
      '{"side":"offense"}'::jsonb, '{"players":[{"waypoints":[1]}]}'::jsonb,
      'sum', 'test',
      (select default_look_id from public.plays where name = 'Flood'),
      1,
      '{"side":"defense","name":"Cover"}'::jsonb, 'look'
    )$$,
  'P0409',
  'version conflict',
  'a second save with the same expected version conflicts'
);

select is(
  (select count(*)::int from public.play_versions where play_id = (select id from public.plays where name = 'Flood')),
  2,
  'the conflicting save did not write a version'
);

select lives_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Iso',
      '{"side":"offense"}'::jsonb, '{"players":[]}'::jsonb,
      'sum', 'test',
      null, null, '{"side":"defense","name":"Cover 3"}'::jsonb, 'look'
    )$$,
  'coach creates an unassigned play'
);

select lives_ok(
  $$insert into public.playbooks (id, team_id, name)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'PB1')$$,
  'coach creates a playbook'
);
select lives_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    select 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', id, 1 from public.plays where name = 'Flood'$$,
  'coach files the assigned play'
);
select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
      'QB'
    )$$,
  'coach assigns the playbook to quarterbacks'
);

select is((select count(*)::int from public.plays), 2, 'coach sees both plays');
select lives_ok(
  $$update public.plays set name = 'Flood' where name = 'Flood'$$,
  'coach can update a play'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.plays where name = 'Flood'), 1, 'quarterback sees the assigned play');
select is((select count(*)::int from public.plays where name = 'Iso'), 0, 'quarterback does not see the unassigned play');
select is((select count(*)::int from public.scout_looks), 1, 'quarterback sees the linked look');

select throws_ok(
  $$insert into public.plays (team_id, name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Nope')$$,
  '42501',
  'permission denied for table plays',
  'a player insert is denied'
);

update public.plays set name = 'Hacked' where name = 'Flood';
select is((select name from public.plays where name in ('Flood', 'Hacked')), 'Flood', 'a player update changes no rows');

select throws_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Nope',
      '{"side":"offense"}'::jsonb, '{"players":[]}'::jsonb,
      'sum', 'test',
      null, null, '{"side":"defense","name":"No"}'::jsonb, 'look'
    )$$,
  '42501',
  'forbidden',
  'a player cannot save a play version'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.plays), 0, 'safety sees no plays yet');
select is((select count(*)::int from public.scout_looks), 0, 'safety sees no looks yet');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
      'DB'
    )$$,
  'coach assigns the playbook to defensive backs'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.plays where name = 'Flood'), 1, 'safety sees the play after the group is assigned');
select is((select count(*)::int from public.plays where name = 'Iso'), 0, 'safety still does not see the unfiled extra');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.plays where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 0, 'other team sees no plays');
select is((select count(*)::int from public.play_versions), 0, 'other team sees no play versions');
select is((select count(*)::int from public.scout_looks), 0, 'other team sees no looks');
select is((select count(*)::int from public.scout_look_versions), 0, 'other team sees no look versions');
select is((select count(*)::int from public.playbooks), 0, 'other team sees no playbooks');
select is((select count(*)::int from public.playbook_plays), 0, 'other team sees no playbook plays');
select is((select count(*)::int from public.assignments), 0, 'other team sees no assignments');
select is((select count(*)::int from public.assignment_targets), 0, 'other team sees no assignment targets');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select throws_ok(
  $$update public.play_versions set checksum = 'no' where play_id = (select id from public.plays where name = 'Iso')$$,
  '42501',
  'permission denied for table play_versions',
  'play versions cannot be updated'
);
select throws_ok(
  $$delete from public.play_versions where play_id = (select id from public.plays where name = 'Iso')$$,
  '42501',
  'permission denied for table play_versions',
  'play versions cannot be deleted'
);

select lives_ok(
  $$update public.plays set archived_at = now() where name = 'Flood'$$,
  'coach archives a play'
);
select is((select count(*)::int from public.plays where name = 'Flood'), 0, 'archive hides the play from staff');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.plays where name = 'Flood'), 0, 'archive hides the play from the assigned player');

reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.plays$$,
  '42501',
  'permission denied for table plays',
  'anon cannot read plays'
);

select * from finish();
rollback;
