begin;
select plan(27);
set local search_path = public, extensions, auth;

-- Team S is on Starter (no billing account): 11 head coach, 13 a player.
-- Team P is on a manual Program plan: 21 head coach.
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

create function pg_temp.login(uid text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', uid, true);
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.login(text) to authenticated;

-- n players on a team, each a new user.
create function pg_temp.add_players(team uuid, n int, tag text)
returns void
language plpgsql
as $$
declare
  uid uuid;
begin
  for i in 1..n loop
    uid := gen_random_uuid();
    perform pg_temp.make_user(uid, tag || i || '@example.com');
    insert into public.memberships (team_id, user_id, role, position) values (team, uid, 'player', 'WR');
  end loop;
end;
$$;

do $$
begin
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc-s@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach-s@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'hc-p@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22', 'coach-p@example.com');
end $$;

insert into public.billing_accounts (id, plan, manual_until) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'program', now() + interval '1 year');
insert into public.teams (id, name, season_ends_on, created_by, billing_account_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Starter Team', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Program Team', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02');
insert into public.memberships (team_id, user_id, role) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach');

-- 1. Plans.
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'starter', 'no account is Starter');
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'), 'program', 'a manual plan counts until it ends');

set local role authenticated;
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select ok(
  (select manual_until > now() from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02')),
  'the head coach sees when a manual plan ends'
);
reset role;

-- 2. Plays: 15 live plays on Starter.
insert into public.plays (team_id, name, side)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Play ' || g, 'offense' from generate_series(1, 15) g;
select is((select count(*)::int from public.plays where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
          15, 'Starter holds 15 plays');

select throws_ok(
  $$insert into public.plays (team_id, name, side) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Sixteen', 'offense')$$,
  'PLAN1', null,
  'the 16th play is refused'
);

set local role authenticated;
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$update public.plays set archived_at = now() where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and name = 'Play 1'$$,
  'archiving a play frees a spot'
);
reset role;
select lives_ok(
  $$insert into public.plays (team_id, name, side) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Replacement', 'offense')$$,
  'a new play fits after archiving one'
);
set local role authenticated;
select throws_ok(
  $$update public.plays set archived_at = null where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and name = 'Play 1'$$,
  'PLAN1',
  'Your plan includes up to 15 plays. Archive one or upgrade. Open Team → Billing to upgrade.',
  'bringing an archived play back counts too, and the head coach is sent to Billing'
);
select lives_ok(
  $$update public.plays set name = 'Play 2 renamed' where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and name = 'Play 2'$$,
  'existing plays still edit at the limit'
);
reset role;

-- Anyone but the head coach (here, a signed-in user who is not on the team) is told to ask.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');

-- 3. Coaches: one on Starter.
select throws_ok(
  $$insert into public.memberships (team_id, user_id, role)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach')$$,
  'PLAN1',
  'Your plan includes 1 coach. Ask your head coach to upgrade.',
  'a second coach is refused, and anyone but the head coach is told to ask'
);

-- 4. Players: 25 on Starter, pending invites included.
select pg_temp.add_players('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 24, 'p');
insert into public.invites (team_id, email, display_name, role, position, token_hash, invited_by)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'pending@example.com', 'Pending', 'player', 'WR',
        extensions.digest('t1', 'sha256'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select throws_ok(
  $$insert into public.invites (team_id, email, display_name, role, position, token_hash, invited_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'late@example.com', 'Late', 'player', 'WR',
            extensions.digest('t2', 'sha256'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'PLAN1', null,
  '24 players and 1 pending invite fill Starter, so another invite is refused'
);
select throws_ok(
  $$insert into public.invites (team_id, email, display_name, role, token_hash, invited_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'coach2@example.com', 'Coach Two', 'coach',
            extensions.digest('t3', 'sha256'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'PLAN1', null,
  'inviting a second coach is refused'
);
select lives_ok(
  $$select pg_temp.add_players('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 1, 'q')$$,
  'the 25th player joins (the pending invite being accepted)'
);
select throws_ok(
  $$select pg_temp.add_players('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 1, 'r')$$,
  'PLAN1', null,
  'a 26th player is refused'
);

-- 5. Features.
insert into public.scout_looks (id, team_id, side, name) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Cover 2');
insert into public.roster_players (id, team_id, name) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Sam Lee');

select throws_ok(
  $$insert into public.scout_reps (team_id, play_id, look_id, slot, target_x, target_y)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id, 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'x', 0, 0
    from public.plays where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' limit 1$$,
  'PLAN1', null,
  'rep homework is not on Starter'
);
select throws_ok(
  $$insert into public.playbooks (team_id, name, pack_week)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Week of Nov 23', '2026-11-23')$$,
  'PLAN1', null,
  'scout packs are not on Starter'
);
select lives_ok(
  $$insert into public.playbooks (team_id, name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base offense')$$,
  'plain playbooks are on Starter'
);
select throws_ok(
  $$insert into public.depth_chart (team_id, slot, rank, roster_player_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'QB', 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddd01')$$,
  'PLAN1', null,
  'the depth chart is not on Starter'
);
select throws_ok(
  $$insert into public.film (team_id, title, size_bytes) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Game', 1000)$$,
  'PLAN1', null,
  'game film is not on Starter'
);
insert into public.activity_daily (team_id, user_id, day, play_id, kind, seconds)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', user_id, current_date,
       (select id from public.plays where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' limit 1), 'pov', 30
from public.memberships where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and role = 'player' limit 1;
select is((select count(*)::int from public.activity_daily where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
          0, 'activity is skipped on Starter, with no error for the player');

-- 6. A paid plan has none of these limits.
insert into public.plays (team_id, name, side)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'P' || g, 'offense' from generate_series(1, 20) g;
select is((select count(*)::int from public.plays where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'),
          20, 'Program holds 20 plays');
select lives_ok(
  $$insert into public.memberships (team_id, user_id, role)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22', 'coach')$$,
  'Program takes a second coach'
);
select lives_ok(
  $$insert into public.film (team_id, title, size_bytes) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Game', 1000)$$,
  'Program takes film'
);
select lives_ok(
  $$select pg_temp.add_players('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 30, 'prog')$$,
  'Program takes 30 players'
);

-- 7. A downgrade keeps everything readable; only new things are refused.
update public.billing_accounts set manual_until = now() - interval '1 day'
where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02';
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'), 'starter', 'an ended manual plan is Starter');
set local role authenticated;
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select results_eq(
  $$select (select count(*)::int from public.plays where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'),
           (select count(*)::int from public.film where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'),
           (select count(*)::int from public.memberships where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02')$$,
  $$values (20, 1, 32)$$,
  'after a downgrade the head coach still reads every play, film and member'
);
reset role;
select throws_ok(
  $$insert into public.plays (team_id, name, side) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'New', 'offense')$$,
  'PLAN1', null,
  'over the limit after a downgrade, a new play is refused'
);

select * from finish();
rollback;
