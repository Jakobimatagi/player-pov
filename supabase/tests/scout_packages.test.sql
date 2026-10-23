begin;
select plan(58);
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

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Flood',
      '{"side":"offense"}'::jsonb, '{"players":[{"waypoints":[1]}]}'::jsonb,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      null, null, '{"side":"defense","name":"Cover A"}'::jsonb,
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  'coach creates Flood'
);
select lives_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Iso',
      '{"side":"offense"}'::jsonb, '{"players":[{"waypoints":[1]}]}'::jsonb,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      null, null, '{"side":"defense","name":"Cover B"}'::jsonb,
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  'coach creates Iso'
);

create temp table look_ids (play_name text primary key, look_id uuid);
insert into look_ids select name, default_look_id from public.plays;

reset role;
update public.plays set default_look_id = null;
set local role authenticated;
set local search_path = public, extensions, auth;
select lives_ok(
  $$insert into public.scout_packages (id, team_id, name) values
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'PK1'),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'PK2')$$,
  'coach creates two packages'
);
select lives_ok(
  $$insert into public.scout_package_looks (package_id, look_id, sort)
    select 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'::uuid, look_id, 1 from look_ids where play_name = 'Flood'
    union all
    select 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'::uuid, look_id, 1 from look_ids where play_name = 'Iso'$$,
  'coach files each look in a package'
);
select lives_ok(
  $$update public.scout_packages set name = 'PK1 renamed' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'$$,
  'coach renames a package'
);
select lives_ok(
  $$delete from public.scout_package_looks where package_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'$$,
  'coach removes a look from the unassigned package'
);
select lives_ok(
  $$insert into public.scout_package_looks (package_id, look_id, sort)
    select 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'::uuid, look_id, 1 from look_ids where play_name = 'Iso'$$,
  'coach puts that look back'
);
select lives_ok(
  $$insert into public.playbooks (id, team_id, name) values
      ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'PB1')$$,
  'coach creates a playbook'
);
select lives_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    select 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', id, 1 from public.plays where name = 'Flood'$$,
  'coach puts Flood in the playbook'
);
select lives_ok(
  $$insert into public.assignments (team_id, package_id, assignee_group) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'QB')$$,
  'coach assigns PK1 to quarterbacks'
);
select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'QB')$$,
  'coach assigns PB1 to quarterbacks'
);
select lives_ok(
  $$insert into public.player_slots (team_id, play_id, user_id, slot)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id,
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb'
    from public.plays where name = 'Flood'$$,
  'coach sets the quarterback slot'
);

select is((select count(*)::int from public.scout_packages), 2, 'coach sees both packages');
select is(
  (select count(*)::int from public.assignment_targets where package_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'),
  1,
  'assignment targets carry the package id'
);
select is((select count(*)::int from public.scout_looks), 2, 'coach sees both looks');
select is((select count(*)::int from public.player_slots), 1, 'coach sees the slot');
select is(
  (select created_by from public.scout_packages where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'::uuid,
  'a package created_by defaults to the creating coach'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$update public.scout_packages
    set opponent = 'Rival High'
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'$$,
  'another staff member can update a package'
);
select throws_ok(
  $$insert into public.scout_packages (id, team_id, name, created_by)
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddddd99',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'Spoof package',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21'
    )$$,
  '42501',
  'new row violates row-level security policy for table "scout_packages"',
  'a spoofed package created_by is rejected'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.scout_packages where name = 'PK1 renamed'), 1, 'quarterback sees the assigned package');
select is((select count(*)::int from public.scout_packages where name = 'PK2'), 0, 'quarterback does not see the unassigned package');
select is(
  (select count(*)::int from public.scout_looks where name = 'Cover A'),
  1,
  'quarterback sees the look in the assigned package'
);
select is(
  (select count(*)::int from public.scout_look_versions
    where look_id = (select look_id from look_ids where play_name = 'Flood')),
  1,
  'an assigned player can read look versions through a package'
);
select is(
  (select count(*)::int from public.scout_looks where name = 'Cover B'),
  0,
  'quarterback does not see the look in the unassigned package'
);
select is((select count(*)::int from public.scout_package_looks), 1, 'quarterback sees one package look');
select is((select slot from public.player_slots), 'qb', 'quarterback sees their own slot');
select throws_ok(
  $$insert into public.scout_packages (team_id, name) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Nope')$$,
  '42501',
  'new row violates row-level security policy for table "scout_packages"',
  'a player cannot insert a package'
);
select throws_ok(
  $$insert into public.player_slots (team_id, play_id, user_id, slot)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id,
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'x'
    from public.plays where name = 'Flood'$$,
  '42501',
  'new row violates row-level security policy for table "player_slots"',
  'a player cannot insert a slot'
);

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.scout_packages), 0, 'safety sees no packages');
select is((select count(*)::int from public.scout_looks), 0, 'safety sees no looks');
select is(
  (select count(*)::int from public.scout_look_versions
    where look_id = (select look_id from look_ids where play_name = 'Flood')),
  0,
  'an unassigned player cannot read look versions through a package'
);
select is((select count(*)::int from public.player_slots), 0, 'safety sees no slots');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is(
  (select count(*)::int from public.scout_packages where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
  0,
  'other team sees no packages'
);
select is(
  (select count(*)::int from public.scout_looks where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
  0,
  'other team sees no looks'
);
select is((select count(*)::int from public.scout_package_looks), 0, 'other team sees no package looks');
select is((select count(*)::int from public.player_slots), 0, 'other team sees no slots');
select is(
  (select count(*)::int from public.assignments where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
  0,
  'other team sees no assignments'
);

-- QA leak.sql, repeated after this migration recreates can_view_play and looks_select.
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
      '{"side":"offense","secret":"B-play"}'::jsonb, '{"players":[]}'::jsonb,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
      null, null, '{"side":"defense","name":"B secret look","secret":"B-look"}'::jsonb,
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    )$$,
  'team B coach saves a play'
);
select lives_ok(
  $$insert into public.scout_packages (id, team_id, name) values
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd03', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'PKB')$$,
  'team B coach creates a package'
);

reset role;
select set_config('test.b_play', (select id::text from public.plays where name = 'B secret play'), true);
select set_config('test.b_look', (select default_look_id::text from public.plays where name = 'B secret play'), true);

set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select throws_ok(
  $$insert into public.scout_package_looks (package_id, look_id, sort) values
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', current_setting('test.b_look')::uuid, 2)$$,
  '23514',
  'look is not on this package team',
  'a team B look cannot be filed in a team A package'
);
select throws_ok(
  $$insert into public.assignments (team_id, package_id, assignee_group) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd03', 'QB')$$,
  '23514',
  'package is not on this team',
  'an assignment cannot target another team''s package'
);
select throws_ok(
  $$insert into public.player_slots (team_id, play_id, user_id, slot) values
      (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
        current_setting('test.b_play')::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13',
        'qb'
      )$$,
  '23514',
  'play is not on this slot''s team',
  'a slot cannot point at another team''s play'
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
values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_setting('test.b_play')::uuid, 2);
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
set local session_replication_role = replica;
update public.plays
set default_look_id = current_setting('test.b_look')::uuid
where name = 'Flood';
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
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select ok(
  not has_function_privilege('anon', 'app.guard_package_look()', 'EXECUTE'),
  'anon cannot execute guard_package_look'
);
select ok(
  not has_function_privilege('authenticated', 'app.guard_package_look()', 'EXECUTE'),
  'authenticated cannot execute guard_package_look'
);
select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname = 'guard_package_look'
      and p.proconfig @> array['search_path=""']
  ),
  'guard_package_look pins search_path'
);
select throws_ok(
  $$update public.scout_packages
    set team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'$$,
  '42501',
  'permission denied for table scout_packages',
  'a coach cannot change a package team_id'
);

reset role;
set local search_path = public, extensions, auth;
select throws_ok(
  $$update public.scout_looks
    set team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
    where name = 'Cover A'$$,
  '23514',
  'team_id is immutable',
  'a look team_id cannot change'
);
select throws_ok(
  $$update public.scout_packages
    set team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'$$,
  '23514',
  'team_id is immutable',
  'a package team_id cannot change'
);
select col_not_null('public', 'scout_packages', 'created_at', 'scout package created_at is not null');

set local role anon;
select throws_ok(
  $$select count(*) from public.scout_packages$$,
  '42501',
  'permission denied for table scout_packages',
  'anon cannot read packages'
);
select throws_ok(
  $$select count(*) from public.scout_package_looks$$,
  '42501',
  'permission denied for table scout_package_looks',
  'anon cannot read package looks'
);
select throws_ok(
  $$select count(*) from public.player_slots$$,
  '42501',
  'permission denied for table player_slots',
  'anon cannot read slots'
);

select * from finish();
rollback;
