begin;
select plan(34);
set local search_path = public, extensions, auth;

-- Users: 11 head coach, 12 offensive coordinator, 15 defensive coordinator,
-- 16 position coach (no side), 13 QB (not assigned), 14 FS (assigned), 21 other team.
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
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'oc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'dc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', 'lb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'fs@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 't2@example.com');
end $$;

insert into public.teams (id, name, season_ends_on, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Team B', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');

insert into public.memberships (team_id, user_id, role, position, coordinates) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null, 'offense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'coach', null, 'defense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', 'coach', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'player', 'S', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null);

select throws_ok(
  $$update public.memberships set coordinates = 'defense'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'$$,
  '23514', null,
  'a player cannot be a coordinator'
);

-- One offense play with a QB and a free safety in its current version.
insert into public.plays (id, team_id, name, side, current_version) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Flood', 'offense', 1);
insert into public.play_versions (
  play_id, version, source, compiled, source_schema, compiled_schema, compiler_version, checksum
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 1, '{}'::jsonb,
  '{"players":[{"id":"qb","team":"offense"},{"id":"fs","team":"defense"}]}'::jsonb,
  1, 1, 'test', 'x'
);

-- A defense book holding the play, assigned to the FS.
insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base D', 'defense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base O', 'offense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
insert into public.playbook_plays (playbook_id, play_id, sort) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 0);
insert into public.assignments (team_id, playbook_id, assignee_user) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14');

set local role authenticated;

-- can_edit_side matrix
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select ok(app.can_edit_side('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense'), 'OC edits offense');
select ok(not app.can_edit_side('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense'), 'OC does not edit defense');
select is(app.my_side('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'offense', 'OC side is offense');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select ok(app.can_edit_side('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense'), 'head coach edits defense');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16","role":"authenticated"}', true);
select ok(app.can_edit_side('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense'), 'coach with no side edits both');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
select ok(not app.can_edit_side('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense'), 'player edits nothing');

-- Playbooks by side
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.playbooks (team_id, name, side)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'OC Install', 'offense')$$,
  'OC creates an offense playbook'
);
select throws_ok(
  $$insert into public.playbooks (team_id, name, side)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'OC Sneaky D', 'defense')$$,
  '42501', null,
  'OC cannot create a defense playbook'
);
select results_eq(
  $$with changed as ( update public.playbooks set name = 'Renamed' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01' returning id ) select count(*)::int from changed$$,
  $$values (0)$$,
  'OC cannot rename the defense playbook'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select results_eq(
  $$with changed as ( update public.playbooks set name = 'Base D 2' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01' returning id ) select count(*)::int from changed$$,
  $$values (1)$$,
  'DC renames the defense playbook'
);
select throws_ok(
  $$update public.playbooks set side = 'offense'
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'$$,
  '42501', null,
  'DC cannot move a book to offense'
);
select results_eq(
  $$with gone as ( delete from public.playbooks where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02' returning id ) select count(*)::int from gone$$,
  $$values (0)$$,
  'DC cannot delete the offense playbook'
);
select lives_ok(
  $$insert into public.playbooks (team_id, name, side)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Shared', null)$$,
  'a coordinator can create a shared playbook'
);
select is(
  (select count(*)::int from public.playbooks where side = 'offense'),
  2,
  'DC still reads offense playbooks'
);

-- Position rules
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side, assignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'qb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'offense', 'Read flat to corner')$$,
  'OC writes the QB rule'
);
select throws_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side, assignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'offense', 'Lying about the side')$$,
  '42501', null,
  'OC cannot write the FS rule even by sending side offense'
);
select throws_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'mike', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'defense')$$,
  '23514', null,
  'a slot the play does not have is rejected'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side, alignment, key_read)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'defense', '12 yards, split the hashes', '#2 receiver vertical')$$,
  'DC writes the FS rule'
);
select is(
  (select side from public.position_rules where slot = 'fs'),
  'defense',
  'rule side comes from the play'
);
select is(
  (select updated_by::text from public.position_rules where slot = 'fs'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15',
  'rule is stamped with its author'
);
select results_eq(
  $$with changed as ( update public.position_rules set notes = 'nope' where slot = 'qb' returning slot ) select count(*)::int from changed$$,
  $$values (0)$$,
  'DC cannot edit the QB rule'
);
select throws_ok(
  $$update public.position_rules set slot = 'qb' where slot = 'fs'$$,
  '42501', null,
  'a rule cannot move to another slot'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select results_eq(
  $$with changed as ( update public.position_rules set notes = 'Hot vs pressure' where slot = 'qb' returning slot ) select count(*)::int from changed$$,
  $$values (1)$$,
  'OC edits the QB rule'
);
select results_eq(
  $$with gone as ( delete from public.position_rules where slot = 'fs' returning slot ) select count(*)::int from gone$$,
  $$values (0)$$,
  'OC cannot delete the FS rule'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
select is((select count(*)::int from public.position_rules), 2, 'assigned player reads every rule on the play');
select throws_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'qb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'offense')$$,
  '42501', null,
  'a player cannot write rules'
);
select results_eq(
  $$with changed as ( update public.position_rules set notes = 'mine now' where slot = 'fs' returning slot ) select count(*)::int from changed$$,
  $$values (0)$$,
  'a player cannot edit their own rule'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is((select count(*)::int from public.position_rules), 0, 'unassigned player reads no rules');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
select is((select count(*)::int from public.position_rules), 0, 'other team reads no rules');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select is((select count(*)::int from public.position_rules), 2, 'head coach reads every rule');
select lives_ok(
  $$update public.memberships set coordinates = 'defense'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16'$$,
  'head coach makes a coach the DC'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select results_eq(
  $$with changed as ( update public.memberships set coordinates = 'defense' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12' returning user_id ) select count(*)::int from changed$$,
  $$values (0)$$,
  'a coordinator cannot change their own side'
);

reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.position_rules$$,
  '42501', null,
  'anon cannot read rules'
);

select * from finish();
rollback;
