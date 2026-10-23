begin;
select plan(56);
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
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      null, null, '{"side":"defense","name":"Cover"}'::jsonb, 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
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
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      (select default_look_id from public.plays where name = 'Flood'),
      1,
      '{"side":"defense","name":"Cover"}'::jsonb, 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
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
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      (select default_look_id from public.plays where name = 'Flood'),
      1,
      '{"side":"defense","name":"Cover"}'::jsonb, 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  'PT409',
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
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      null, null, '{"side":"defense","name":"Cover 3"}'::jsonb, 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
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
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      null, null, '{"side":"defense","name":"No"}'::jsonb, 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
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
select is((select count(*)::int from public.plays where name = 'Flood'), 1, 'staff still sees an archived play');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.plays where name = 'Flood'), 0, 'an assigned player cannot see an archived play');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$update public.plays set archived_at = null where name = 'Flood'$$,
  'coach restores an archived play'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.plays where name = 'Flood'), 1, 'quarterback sees the play after restore');

-- QA leak.sql. The read cases insert the bad link and the bad look pointer
-- with the guard trigger and foreign keys switched off, so they still run
-- after those guards exist.
reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
      null, null, 'B secret play',
      '{"side":"offense","secret":"B-play"}'::jsonb,
      '{"players":[]}'::jsonb,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'test',
      null, null,
      '{"side":"defense","name":"B secret look","secret":"B-look"}'::jsonb,
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  'team B coach saves a play'
);

reset role;
select set_config('test.b_play', (select id::text from public.plays where name = 'B secret play'), true);
select set_config('test.b_look', (select default_look_id::text from public.plays where name = 'B secret play'), true);
select set_config('test.a_play', (select id::text from public.plays where name = 'Flood'), true);
select set_config('test.a_look', (select default_look_id::text from public.plays where name = 'Flood'), true);

set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  (select count(*)::int from public.plays where id = current_setting('test.b_play')::uuid),
  0,
  'coach A does not see team B play'
);
select is(
  (select count(*)::int from public.scout_looks where id = current_setting('test.b_look')::uuid),
  0,
  'coach A does not see team B look'
);

select throws_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
      current_setting('test.b_play')::uuid,
      2
    )$$,
  '23514',
  'play is not on this playbook''s team',
  'a cross-team play cannot be filed in a playbook'
);

reset role;
delete from public.playbook_plays
where playbook_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'
  and play_id = current_setting('test.b_play')::uuid;
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'playbook_plays_team_guard'
      and tgrelid = 'public.playbook_plays'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.playbook_plays disable trigger playbook_plays_team_guard';
  end if;
end $$;
insert into public.playbook_plays (playbook_id, play_id, sort)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
  current_setting('test.b_play')::uuid,
  2
);
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'playbook_plays_team_guard'
      and tgrelid = 'public.playbook_plays'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.playbook_plays enable trigger playbook_plays_team_guard';
  end if;
end $$;

set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  (select count(*)::int from public.plays where id = current_setting('test.b_play')::uuid),
  0,
  'quarterback cannot read team B play through a playbook link'
);
select is(
  (select count(*)::int from public.play_versions where play_id = current_setting('test.b_play')::uuid),
  0,
  'quarterback cannot read team B play versions through a playbook link'
);
select is(
  (select count(*)::int from public.scout_looks where id = current_setting('test.b_look')::uuid),
  0,
  'quarterback cannot read team B look through a linked play'
);
select is(
  (select count(*)::int from public.scout_look_versions where look_id = current_setting('test.b_look')::uuid),
  0,
  'quarterback cannot read team B look versions through a linked play'
);

reset role;
update public.plays
set default_look_id = current_setting('test.a_look')::uuid
where id = current_setting('test.a_play')::uuid;

set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select throws_ok(
  $$update public.plays
    set default_look_id = current_setting('test.b_look')::uuid
    where id = current_setting('test.a_play')::uuid$$,
  '42501',
  'permission denied for table plays',
  'a coach cannot point a play at another team''s look'
);

reset role;
select throws_ok(
  $$update public.plays
    set default_look_id = current_setting('test.b_look')::uuid
    where id = current_setting('test.a_play')::uuid$$,
  '23503',
  'insert or update on table "plays" violates foreign key constraint "plays_default_look_team_fkey"',
  'a cross-team default_look_id is rejected'
);

set local session_replication_role = replica;
update public.plays
set default_look_id = current_setting('test.b_look')::uuid
where id = current_setting('test.a_play')::uuid;
set local session_replication_role = origin;

set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  (select count(*)::int from public.scout_looks where id = current_setting('test.b_look')::uuid),
  0,
  'coach A cannot read team B look through a cross-team default_look_id'
);
select is(
  (select count(*)::int from public.scout_look_versions where look_id = current_setting('test.b_look')::uuid),
  0,
  'coach A cannot read team B look versions through a cross-team default_look_id'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  (select count(*)::int from public.scout_looks where id = current_setting('test.b_look')::uuid),
  0,
  'quarterback cannot read team B look through a cross-team default_look_id'
);

reset role;
set local session_replication_role = replica;
update public.plays
set default_look_id = current_setting('test.a_look')::uuid
where id = current_setting('test.a_play')::uuid;
set local session_replication_role = origin;

set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select throws_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Too big source',
      jsonb_build_object('side', 'offense', 'blob', repeat('a', 65536)),
      '{"players":[]}'::jsonb,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'test',
      null, null,
      '{"side":"defense","name":"Cover"}'::jsonb,
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  '22023',
  'source is over 64KB',
  'a source over 64KB is rejected'
);
select throws_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Too big compiled',
      '{"side":"offense"}'::jsonb,
      jsonb_build_object('players', '[]'::jsonb, 'blob', repeat('a', 65536)),
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'test',
      null, null,
      '{"side":"defense","name":"Cover"}'::jsonb,
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  '22023',
  'compiled is over 64KB',
  'a compiled payload over 64KB is rejected'
);
select throws_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Too big look',
      '{"side":"offense"}'::jsonb,
      '{"players":[]}'::jsonb,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'test',
      null, null,
      jsonb_build_object('side', 'defense', 'name', 'Cover', 'blob', repeat('a', 65536)),
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  '22023',
  'look source is over 64KB',
  'a look source over 64KB is rejected'
);
select throws_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Bad sum',
      '{"side":"offense"}'::jsonb,
      '{"players":[]}'::jsonb,
      'sum',
      'test',
      null, null,
      '{"side":"defense","name":"Cover"}'::jsonb,
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  '22023',
  'checksum must be 64 hex characters',
  'a checksum that is not 64 hex characters is rejected'
);
select throws_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Bad look sum',
      '{"side":"offense"}'::jsonb,
      '{"players":[]}'::jsonb,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'test',
      null, null,
      '{"side":"defense","name":"Cover"}'::jsonb,
      'look'
    )$$,
  '22023',
  'look checksum must be 64 hex characters',
  'a look checksum that is not 64 hex characters is rejected'
);

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
