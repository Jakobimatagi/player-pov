begin;
select plan(43);
set local search_path = public, extensions, auth;

-- Users: 11 head coach, 12 offensive coordinator, 15 defensive coordinator,
-- 13 a QB, 14 a WR, 16 a safety, 21 the other team's head coach.
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
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'wr@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', 'fs@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 't2@example.com');
end $$;

insert into public.teams (id, name, season_ends_on, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Team B', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
-- Paid plan for these fixtures; Starter limits are tested in plan_limits.test.sql.
do $paid$
declare
  r record;
  account uuid;
begin
  for r in select id from public.teams where billing_account_id is null loop
    insert into public.billing_accounts (plan, manual_until) values ('program', 'infinity')
    returning id into account;
    update public.teams set billing_account_id = account where id = r.id;
  end loop;
end $paid$;

insert into public.memberships (team_id, user_id, role, position, coordinates) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null, 'offense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'coach', null, 'defense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'player', 'WR', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', 'player', 'S', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null);

set local role authenticated;
set local search_path = public, extensions, auth;

-- Plays: Flood (offense, look Cover A), Iso (offense, look Cover B, stays a draft),
-- Bear (defense, look Trips, an offense look), and Team B's Dive (look Cover Z).
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select public.save_play_version(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', null, null, 'Flood',
  '{"side":"offense"}'::jsonb,
  '{"players":[{"id":"qb","team":"offense","waypoints":[1]},{"id":"x","team":"offense","waypoints":[1]},{"id":"fs","team":"defense","waypoints":[1]}]}'::jsonb,
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
  null, null, '{"side":"defense","name":"Cover A"}'::jsonb,
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
);
select public.save_play_version(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', null, null, 'Iso',
  '{"side":"offense"}'::jsonb,
  '{"players":[{"id":"qb","team":"offense","waypoints":[1]}]}'::jsonb,
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
  null, null, '{"side":"defense","name":"Cover B"}'::jsonb,
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
);
select public.save_play_version(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', null, null, 'Bear',
  '{"side":"defense"}'::jsonb,
  '{"players":[{"id":"fs","team":"defense","waypoints":[1]}]}'::jsonb,
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
  null, null, '{"side":"offense","name":"Trips"}'::jsonb,
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
select public.save_play_version(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', null, null, 'Dive',
  '{"side":"offense"}'::jsonb,
  '{"players":[{"id":"x","team":"offense","waypoints":[1]}]}'::jsonb,
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
  null, null, '{"side":"defense","name":"Cover Z"}'::jsonb,
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
);

reset role;
set local search_path = public, extensions, auth;
create temp table ids (name text primary key, id uuid);
insert into ids select 'play:' || name, id from public.plays
  where team_id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02');
insert into ids select 'look:' || name, id from public.scout_looks
  where team_id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02');
grant select on ids to authenticated;
update public.plays set published_at = now()
  where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and name in ('Flood', 'Bear');
set local role authenticated;
set local search_path = public, extensions, auth;

-- 1. Creating reps.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.scout_reps (id, team_id, play_id, look_id, slot, target_x, target_y, tolerance_yd, note, created_by)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Flood'), (select id from ids where name = 'look:Cover A'),
      'x', 12, -10, 2, 'Sit in the hole', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'head coach creates a rep on Flood vs Cover A for X'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.scout_reps (id, team_id, play_id, look_id, slot, target_x, target_y, created_by)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Flood'), (select id from ids where name = 'look:Cover B'),
      'qb', -5, 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'OC creates a rep on Flood vs Cover B for the QB'
);
select is(
  (select tolerance_yd from public.scout_reps where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'),
  2::double precision,
  'tolerance defaults to 2 yards'
);
select lives_ok(
  $$insert into public.scout_reps (id, team_id, play_id, look_id, slot, target_x, target_y, created_by)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Iso'), (select id from ids where name = 'look:Cover B'),
      'qb', -5, 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'a rep can be drafted on an unpublished play'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.scout_reps (team_id, play_id, look_id, slot, target_x, target_y, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Flood'), (select id from ids where name = 'look:Cover A'),
      'qb', 0, 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15')$$,
  '42501', null,
  'DC cannot create a rep on an offense play'
);
select lives_ok(
  $$insert into public.scout_reps (id, team_id, play_id, look_id, slot, target_x, target_y, created_by)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Bear'), (select id from ids where name = 'look:Trips'),
      'fs', 10, 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15')$$,
  'DC creates a rep on a defense play'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.scout_reps (team_id, play_id, look_id, slot, target_x, target_y, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Flood'), (select id from ids where name = 'look:Cover A'),
      'fs', 0, 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', null,
  'the slot must be one of the play''s own positions'
);
select throws_ok(
  $$insert into public.scout_reps (team_id, play_id, look_id, slot, target_x, target_y, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Flood'), (select id from ids where name = 'look:Trips'),
      'x', 0, 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', null,
  'an offense play is not run against an offense look'
);
select throws_ok(
  $$insert into public.scout_reps (team_id, play_id, look_id, slot, target_x, target_y, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Flood'), (select id from ids where name = 'look:Cover Z'),
      'x', 0, 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', 'look is not on this team',
  'another team''s look is rejected'
);
select throws_ok(
  $$insert into public.scout_reps (team_id, play_id, look_id, slot, target_x, target_y, tolerance_yd, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      (select id from ids where name = 'play:Flood'), (select id from ids where name = 'look:Cover A'),
      'qb', 0, 0, 11, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', null,
  'tolerance stops at 10 yards'
);
select throws_ok(
  $$update public.scout_reps set slot = 'qb' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'$$,
  '42501', null,
  'a rep''s slot cannot be changed'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select results_eq(
  $$with moved as (update public.scout_reps set target_x = 1 where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' returning 1) select count(*)::int from moved$$,
  $$values (0)$$,
  'DC cannot move the target on an offense rep'
);

-- 2. Assigning reps.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.assignments (id, team_id, rep_id, assignee_group, due_at, created_by)
    values ('ffffffff-ffff-4fff-8fff-ffffffffff01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'WR', now() + interval '2 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'head coach assigns the X rep to receivers'
);
select throws_ok(
  $$insert into public.assignments (team_id, rep_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'WR', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23505', null,
  'the same rep cannot go to the same group twice'
);
select throws_ok(
  $$insert into public.assignments (team_id, rep_id, playbook_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', null, 'QB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
           ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', null, null, 'QB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', null,
  'an assignment needs exactly one target'
);
select throws_ok(
  $$insert into public.assignments (team_id, rep_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', 'QB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', 'publish the play before assigning this rep',
  'a rep on a draft play cannot be assigned'
);
select throws_ok(
  $$insert into public.assignments (team_id, rep_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', null,
  'a rep against a look the player cannot read cannot be assigned'
);
select lives_ok(
  $$insert into public.scout_packages (id, team_id, name, created_by) values
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Week 9', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
    insert into public.scout_package_looks (package_id, look_id, sort)
      select 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', id, 1 from ids where name = 'look:Cover B';
    insert into public.assignments (team_id, package_id, assignee_group, created_by)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'QB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'head coach assigns a package with Cover B to quarterbacks'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.assignments (id, team_id, rep_id, assignee_user, created_by)
    values ('ffffffff-ffff-4fff-8fff-ffffffffff02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'OC assigns the Cover B rep to the QB once the package reaches him'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.assignments (team_id, rep_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15')$$,
  '42501', null,
  'DC cannot assign an offense rep'
);
select results_eq(
  $$with gone as (delete from public.assignments where id = 'ffffffff-ffff-4fff-8fff-ffffffffff01' returning 1) select count(*)::int from gone$$,
  $$values (0)$$,
  'DC cannot remove an offense rep assignment'
);
select is(
  (select count(*)::int from public.assignment_targets where rep_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'),
  1,
  'assignment targets carry the rep id'
);

-- 3. What players see.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
select is((select count(*)::int from public.scout_reps), 0, 'a player reads no rep rows, so no targets');
select is(
  (select count(*)::int from public.plays where name = 'Flood'),
  1,
  'the rep assignment opens Flood for the WR'
);
select is(
  (select count(*)::int from public.scout_looks where name = 'Cover A'),
  1,
  'and its look'
);
select results_eq(
  $$select count(*)::int, bool_and(target_x is null and target_y is null and tolerance_yd is null and note is null)
    from public.my_rep_homework('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values (1, true)$$,
  'the WR has one rep and no answer before attempting'
);
select throws_ok(
  $$insert into public.rep_attempts (team_id, assignment_id, rep_id, user_id, end_x, end_y, distance_yd, passed)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'ffffffff-ffff-4fff-8fff-ffffffffff01',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 12, -10, 0, true)$$,
  '42501', null,
  'a player cannot write an attempt directly'
);
select throws_ok(
  $$select * from public.submit_rep_attempt('ffffffff-ffff-4fff-8fff-ffffffffff01', 500, 0)$$,
  '22023', null,
  'a spot off the field is rejected'
);
select results_eq(
  $$select round(distance_yd::numeric, 2), passed, target_x, attempts
    from public.submit_rep_attempt('ffffffff-ffff-4fff-8fff-ffffffffff01', 0, 0)$$,
  $$values (15.62::numeric, false, 12::double precision, 1)$$,
  'a miss is scored on the server and reveals the target'
);
select results_eq(
  $$select target_x, target_y, tolerance_yd, note, attempts, passed
    from public.my_rep_homework('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values (12::double precision, -10::double precision, 2::double precision, 'Sit in the hole'::text, 1, false)$$,
  'after an attempt the WR sees the right spot'
);
select results_eq(
  $$select passed, attempts from public.submit_rep_attempt('ffffffff-ffff-4fff-8fff-ffffffffff01', 12.5, -10.5)$$,
  $$values (true, 2)$$,
  'a retry inside the circle passes'
);
select is(
  (select count(*)::int from public.rep_results('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'players get no coach results'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.rep_attempts),
  0,
  'the QB cannot read the WR''s attempts'
);
select throws_ok(
  $$select * from public.submit_rep_attempt('ffffffff-ffff-4fff-8fff-ffffffffff01', 12, -10)$$,
  '42501', null,
  'the QB cannot answer the WR''s rep'
);
select is(
  (select string_agg(slot, ',') from public.my_rep_homework('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  'qb',
  'the QB lists only his own rep'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.my_rep_homework('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'an unassigned player has no reps'
);

-- 4. Coach results.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select results_eq(
  $$select attempts, first_passed, round(first_distance::numeric, 2), round(best_distance::numeric, 2), passed
    from public.rep_results('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'$$,
  $$values (2, false, 15.62::numeric, 0.71::numeric, true)$$,
  'any coach sees attempts, first try, best distance and pass'
);
select is(
  (select count(*)::int from public.assignment_progress('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'the activity dashboard ignores rep assignments'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.scout_reps) + (select count(*)::int from public.rep_attempts)
    + (select count(*)::int from public.rep_results('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'another team sees no reps, attempts or results'
);

-- 5. Back to Draft: the rep goes quiet, and the coach can still move the due date.
reset role;
set local search_path = public, extensions, auth;
update public.plays set published_at = null
  where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and name = 'Flood';
set local role authenticated;
set local search_path = public, extensions, auth;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.my_rep_homework('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'an unpublished play drops off the homework list'
);
select throws_ok(
  $$select * from public.submit_rep_attempt('ffffffff-ffff-4fff-8fff-ffffffffff01', 12, -10)$$,
  '42501', null,
  'and cannot be answered'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$update public.assignments set due_at = now() + interval '5 days' where id = 'ffffffff-ffff-4fff-8fff-ffffffffff01'$$,
  'OC moves the due date while the play is a draft'
);

-- 6. Removing the WR takes his attempts with him.
reset role;
set local search_path = public, extensions, auth;
delete from public.memberships
where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14';
select is(
  (select count(*)::int from public.rep_attempts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'),
  0,
  'removing a member deletes their attempts'
);

select * from finish();
rollback;
