begin;
select plan(33);
set local search_path = public, extensions, auth;

-- 11 head coach, 12 coach, 13 QB player, 14 FS player on Team A. 21 head coach of Team B.
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
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'fs@example.com');
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

insert into public.memberships (team_id, user_id, role, position) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'player', 'S'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null);

-- P1 published and P2 draft in Base O (assigned to the QB); P3 published in Base D
-- (assigned to the FS); PB published on Team B.
insert into public.plays (id, team_id, name, side, current_version, published_at) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Flood', 'offense', 1, now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Draft', 'offense', 1, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc03', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Cover 3', 'defense', 1, now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc09', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Theirs', 'offense', 1, now());
insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base O', 'offense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base D', 'defense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd09', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Theirs', 'offense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
insert into public.playbook_plays (playbook_id, play_id, sort) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 0),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', 1),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'cccccccc-cccc-4ccc-8ccc-cccccccccc03', 0),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd09', 'cccccccc-cccc-4ccc-8ccc-cccccccccc09', 0);
insert into public.assignments (team_id, playbook_id, assignee_user, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
insert into public.player_slots (team_id, play_id, user_id, slot) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb');

set local role authenticated;

-- The QB records study through the RPC
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'qb', 30, 1, 1)$$,
  'a player records POV time and a completed rep on an assigned play'
);
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'qb', 10, 1, 1)$$,
  'a second heartbeat on the same key adds to the day'
);
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'x', 5000, 0, 0)$$,
  'watching as a teammate records under that slot'
);
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'playbook', '', 20, 0, 0)$$,
  'a player records play sheet time'
);
select is(
  (select seconds from public.activity_daily where slot = 'x'),
  120,
  'seconds per call are capped at 120'
);
select results_eq(
  $$select seconds, runs_started, runs_completed from public.activity_daily
    where kind = 'pov' and slot = 'qb'$$,
  $$values (40, 2, 2)$$,
  'heartbeats upsert into one daily row'
);
select is((select count(*)::int from public.activity_daily), 3, 'the player reads their own rows');

-- The RPC rejects what doesn't belong to the caller
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'qb', -5, 0, 0)$$,
  '22023', null,
  'negative seconds are rejected'
);
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc02', current_date, 'playbook', '', 10, 0, 0)$$,
  '42501', null,
  'a draft play the player cannot view is rejected'
);
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc03', current_date, 'playbook', '', 10, 0, 0)$$,
  '42501', null,
  'a play assigned to someone else is rejected'
);
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc09', current_date, 'playbook', '', 10, 0, 0)$$,
  '42501', null,
  'another team''s play is rejected'
);
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc09', current_date, 'playbook', '', 10, 0, 0)$$,
  '42501', null,
  'a team the player is not on is rejected'
);
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'scroll', '', 10, 0, 0)$$,
  '22023', null,
  'an unknown kind is rejected'
);
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'playbook', 'qb', 10, 0, 0)$$,
  '22023', null,
  'a slot is only recorded for POV'
);
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date + 3, 'pov', 'qb', 10, 0, 0)$$,
  '22023', null,
  'a day far from today is rejected'
);

-- No direct writes
select throws_ok(
  $$insert into public.activity_daily (team_id, user_id, day, play_id, kind, seconds)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13',
      current_date, 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'pov', 9999)$$,
  '42501', null,
  'a player cannot insert activity rows'
);
select throws_ok(
  $$update public.activity_daily set seconds = 9999$$,
  '42501', null,
  'a player cannot update activity rows'
);
select throws_ok(
  $$delete from public.activity_daily$$,
  '42501', null,
  'a player cannot delete activity rows'
);

-- The FS records and reads only their own
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc03', current_date, 'broadcast', '', 15, 1, 0)$$,
  'the FS records broadcast time on their play'
);
select is(
  (select count(*)::int from public.activity_daily),
  1,
  'a player cannot read a teammate''s activity'
);
select is(
  (select count(*)::int from public.activity_summary('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    current_date - 6, current_date)),
  1,
  'a player''s summary is only their own'
);

-- Another team reads nothing
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
select is((select count(*)::int from public.activity_daily), 0, 'another team reads no activity');
select is(
  (select count(*)::int from public.activity_summary('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    current_date - 6, current_date)),
  0,
  'another team gets no summary'
);

-- Any coach on the team reads it all
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select is((select count(*)::int from public.activity_daily), 4, 'a coach reads the team''s activity');
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'qb', 10, 0, 0)$$,
  '42501', null,
  'coaches do not record activity'
);
select results_eq(
  $$select playbook_seconds, pov_seconds, broadcast_seconds, pov_reps, own_slot_reps,
           runs_started, plays_opened, days_active, last_day
    from public.activity_summary('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_date - 6, current_date)
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'$$,
  $$values (20, 160, 0, 2, 2, 2, 1, 1, current_date)$$,
  'the summary rolls up the QB''s week'
);
select is(
  (select count(*)::int from public.activity_summary('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    current_date - 6, current_date)),
  2,
  'the coach summary has every active player'
);
select results_eq(
  $$select plays_total, plays_opened, plays_repped
    from public.assignment_progress('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
    order by playbook_name desc$$,
  $$values (1, 1, 1), (1, 1, 0)$$,
  'assignment progress counts published plays opened and repped in POV'
);

-- A player sees only their own assignment progress
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select results_eq(
  $$select playbook_name, plays_total, plays_opened, plays_repped
    from public.assignment_progress('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values ('Base O'::text, 1, 1, 1)$$,
  'a player''s assignment progress is only their own'
);

-- Signed-out callers cannot record
reset role;
set local role anon;
select throws_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'qb', 10, 0, 0)$$,
  '42501', null,
  'anon cannot call record_activity'
);

-- Removing a member deletes their activity
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select lives_ok(
  $$select public.remove_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14')$$,
  'head coach removes the FS'
);
select lives_ok(
  $$select public.delete_member_data('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13')$$,
  'head coach deletes the QB''s data'
);
reset role;
select is(
  (select count(*)::int from public.activity_daily
   where user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14')),
  0,
  'removed members have no activity left'
);

select * from finish();
rollback;
