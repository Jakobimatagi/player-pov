begin;
select plan(7);
set local search_path = public, extensions, auth;

-- 11 head coach and 13 QB player on Team A, with one published play the QB can view.
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
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
end $$;

insert into public.teams (id, name, season_ends_on, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB');
insert into public.plays (id, team_id, name, side, current_version, published_at) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Flood', 'offense', 1, now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Mesh', 'offense', 1, now());
insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base O', 'offense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
insert into public.playbook_plays (playbook_id, play_id, sort) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 0),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', 1);
insert into public.assignments (team_id, playbook_id, assignee_user, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);

-- Twelve calls of 5 started and 5 completed: 60 of each asked for.
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'qb', 10, 5, 5)
    from generate_series(1, 12)$$,
  'repeated calls past the cap do not raise'
);
select results_eq(
  $$select sum(runs_started)::int, sum(runs_completed)::int from public.activity_daily
    where play_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'$$,
  $$values (40, 20)$$,
  'a play''s day is capped at 40 started and 20 completed runs'
);
select is(
  (select seconds from public.activity_daily
    where play_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01' and slot = 'qb'),
  120,
  'seconds still add up once the run cap is hit'
);

-- Watching as another slot or camera does not open a fresh allowance.
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'pov', 'x', 0, 5, 5)$$,
  'a call on another slot past the cap does not raise'
);
select lives_ok(
  $$select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'cccccccc-cccc-4ccc-8ccc-cccccccccc01', current_date, 'broadcast', '', 0, 5, 5)$$,
  'a call on another camera past the cap does not raise'
);
select results_eq(
  $$select sum(runs_started)::int, sum(runs_completed)::int from public.activity_daily
    where play_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'$$,
  $$values (40, 20)$$,
  'the cap covers every slot and camera on the play'
);

-- The cap is per play: another play has its own.
select public.record_activity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
  'cccccccc-cccc-4ccc-8ccc-cccccccccc02', current_date, 'pov', 'qb', 10, 3, 3);
select is(
  (select runs_completed from public.activity_daily
    where play_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02'),
  3,
  'another play keeps its own allowance'
);

select * from finish();
