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

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Flood',
      '{"side":"offense"}'::jsonb, '{"players":[{"waypoints":[1]}]}'::jsonb,
      'sum', 'test', null, null, '{"side":"defense","name":"Cover A"}'::jsonb, 'look'
    )$$,
  'coach creates Flood'
);
select lives_ok(
  $$select public.save_play_version(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      null, null, 'Iso',
      '{"side":"offense"}'::jsonb, '{"players":[{"waypoints":[1]}]}'::jsonb,
      'sum', 'test', null, null, '{"side":"defense","name":"Cover B"}'::jsonb, 'look'
    )$$,
  'coach creates Iso'
);

create temp table look_ids (play_name text primary key, look_id uuid);
insert into look_ids select name, default_look_id from public.plays;

select lives_ok(
  $$update public.plays set default_look_id = null$$,
  'coach unlinks the looks from the plays'
);
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

reset role;
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
