begin;
select plan(29);
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

-- Coach builds: Opponents > 2026 > Lincoln (Flood), and Ours > Base (Iso).
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
select lives_ok(
  $$insert into public.playbooks (id, team_id, name, kind, parent_id) values
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Opponents', 'opponent', null),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', '2026', 'opponent', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Lincoln High', 'opponent', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Our Playbooks', 'playbook', null),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base Offense', 'playbook', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04')$$,
  'coach creates nested folders'
);
select is(
  (select kind from public.playbooks where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03'),
  'opponent',
  'a folder keeps its kind'
);
select throws_ok(
  $$insert into public.playbooks (team_id, name, kind) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Bad', 'scouting')$$,
  '23514',
  null,
  'an unknown kind is rejected'
);
select lives_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    select 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03'::uuid, id, 1 from public.plays where name = 'Flood'
    union all
    select 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05'::uuid, id, 1 from public.plays where name = 'Iso'$$,
  'coach files Flood and Iso'
);
select throws_ok(
  $$update public.playbooks set parent_id = id where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'$$,
  '23514',
  'a folder cannot contain itself',
  'a folder cannot be its own parent'
);
select throws_ok(
  $$update public.playbooks set parent_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03'
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'$$,
  '23514',
  'a folder cannot move inside its own subfolder',
  'moving a folder under its own descendant is rejected'
);
select lives_ok(
  $$update public.playbooks set parent_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04'
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05'$$,
  'coach can re-save a folder under the same parent'
);
select lives_ok(
  $$insert into public.playbooks (id, team_id, name, parent_id) values
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee12', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'L3', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee13', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'L4', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee12'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'L5', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee13'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee15', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'L6', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee16', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'L7', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee15'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee17', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'L8', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee16')$$,
  'folders nest eight deep (Our Playbooks > Base Offense > L3 ... L8)'
);
select throws_ok(
  $$insert into public.playbooks (team_id, name, parent_id) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'L9', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee17')$$,
  '23514',
  'folders nest at most 8 deep',
  'a ninth level is rejected'
);
select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'QB')$$,
  'coach assigns the Opponents folder to quarterbacks'
);

-- Team B cannot hang a folder under Team A, and sees none of Team A's folders.
reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select throws_ok(
  $$insert into public.playbooks (team_id, name, parent_id) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Sneak', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01')$$,
  '23514',
  'parent folder is on another team',
  'a folder cannot sit under another team''s folder'
);
select is(
  (select count(*)::int from public.playbooks where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
  0,
  'another team sees no folders'
);

-- The quarterback is assigned the top folder and inherits everything under it.
reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select set_eq(
  $$select name from public.playbooks$$,
  array['Opponents', '2026', 'Lincoln High'],
  'quarterback sees the assigned folder and its subfolders'
);
select set_eq(
  $$select name from public.plays$$,
  array['Flood'],
  'quarterback sees a play two folders down, and not the unassigned one'
);
select is(
  (select count(*)::int from public.play_versions pv join public.plays pl on pl.id = pv.play_id where pl.name = 'Flood'),
  1,
  'quarterback reads the nested play''s version'
);
select is(
  (select count(*)::int from public.playbook_plays),
  1,
  'quarterback sees only the nested filing'
);
select lives_ok(
  $$update public.playbooks set parent_id = null where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03'$$,
  'a player update runs'
);

-- The safety has no assignment.
reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select is((select count(*)::int from public.playbooks), 0, 'an unassigned player sees no folders');
select is((select count(*)::int from public.plays), 0, 'an unassigned player sees no plays');

-- Archiving a middle folder hides everything under it from players.
reset role;
set local search_path = public, extensions, auth;
select is(
  (select parent_id from public.playbooks where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03'),
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'::uuid,
  'the player update moved nothing'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$update public.playbooks set archived_at = now() where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'$$,
  'coach archives the 2026 folder'
);
select is((select count(*)::int from public.playbooks where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 11, 'staff still see archived folders');

reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select set_eq(
  $$select name from public.playbooks$$,
  array['Opponents'],
  'an archived middle folder hides itself and everything under it'
);
select is((select count(*)::int from public.plays), 0, 'the nested play is hidden once its folder is archived');

-- Deleting a folder deletes its subfolders, not the plays.
reset role;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
set local role authenticated;
set local search_path = public, extensions, auth;

select lives_ok(
  $$delete from public.playbooks where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'$$,
  'coach deletes the Opponents folder'
);
select is(
  (select count(*)::int from public.playbooks where id in (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03')),
  0,
  'its subfolders go with it'
);
select is((select count(*)::int from public.plays where name = 'Flood'), 1, 'the play itself stays');

select * from finish();
rollback;
