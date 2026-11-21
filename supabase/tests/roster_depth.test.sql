begin;
select plan(31);
set local search_path = public, extensions, auth;

-- 11 head coach, 12 OC, 15 DC, 13 QB player, 14 FS player, 21 other team's head coach.
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'player', 'S', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null);

select is(
  (select count(*)::int from public.roster_players where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
  2,
  'each player membership gets a roster row, coaches do not'
);
select is(
  (select position::text from public.roster_players
   where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'),
  'QB',
  'roster row starts with the membership position'
);

-- A player with no account, on Team A and on Team B.
insert into public.roster_players (id, team_id, name, jersey, position) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Backup QB', 10, 'QB'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Their QB', 3, 'QB');

create temp table ids as
select user_id, id from public.roster_players where user_id is not null;
grant select on ids to authenticated;

set local role authenticated;

-- Staff manage the roster
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select is((select count(*)::int from public.roster_players), 3, 'a coach reads their roster only');
select lives_ok(
  $$insert into public.roster_players (team_id, name, jersey, position, grad_year, height_in, weight_lb)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Walk On', 44, 'LB', 2028, 70, 185)$$,
  'a coach adds a player without an account'
);
select throws_ok(
  $$insert into public.roster_players (team_id, name, jersey)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Too Big', 100)$$,
  '23514', null,
  'jersey numbers stop at 99'
);
select throws_ok(
  $$update public.roster_players set user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15'
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'$$,
  '23514', null,
  'a roster row cannot link to a coach'
);
select results_eq(
  $$with c as (update public.roster_players set jersey = 7, height_in = 74
     where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13' returning 1) select count(*)::int from c$$,
  $$values (1)$$,
  'a coach updates a player''s details'
);
select throws_ok(
  $$update public.roster_players set position = 'WR'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'$$,
  '42501', null,
  'only the head coach changes an account holder''s position'
);
select results_eq(
  $$with c as (update public.roster_players set position = 'RB'
     where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' returning 1) select count(*)::int from c$$,
  $$values (1)$$,
  'a coach changes the position of a player without an account'
);
select results_eq(
  $$with c as (update public.roster_players set name = 'Mine'
     where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02' returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'a coach cannot touch another team''s roster'
);

-- Head coach position change flows to the membership, and back
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select lives_ok(
  $$update public.roster_players set position = 'CB'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'$$,
  'head coach changes an account holder''s position'
);
select is(
  (select position::text from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'),
  'CB',
  'the membership follows the roster position'
);
select lives_ok(
  $$update public.memberships set position = 'S' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'$$,
  'head coach changes the membership position'
);
select is(
  (select position::text from public.roster_players where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'),
  'S',
  'the roster follows the membership position'
);

-- Depth chart by side
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'QB', array[
      (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'::uuid])$$,
  'OC sets the QB depth'
);
select results_eq(
  $$select roster_player_id from public.depth_chart where slot = 'QB' order by rank$$,
  $$select (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13')
    union all select 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'::uuid$$,
  'depth keeps the given order'
);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'QB',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'::uuid])$$,
  'OC reorders the QB depth'
);
select is((select count(*)::int from public.depth_chart where slot = 'QB'), 1, 'set_depth replaces the slot');
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'FS',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'::uuid])$$,
  '42501', null,
  'OC cannot set the FS depth'
);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'KR_R1',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'::uuid])$$,
  'special teams are shared'
);
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'RB',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'::uuid])$$,
  '23503', null,
  'another team''s player cannot be on the depth chart'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'FS',
      array[(select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14')])$$,
  'DC sets the FS depth'
);
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'SS', array[
      (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'),
      (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14')])$$,
  '23505', null,
  'a player is listed once per position'
);

-- Merge a typed-in row into the account holder's row
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select throws_ok(
  $$select public.merge_roster_players(
      (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01')$$,
  '42501', null,
  'DC cannot merge away a player who holds offense depth spots'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select lives_ok(
  $$select public.merge_roster_players(
      (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01')$$,
  'head coach merges the typed-in row into the account row'
);
select results_eq(
  $$select r.jersey::int, (select count(*)::int from public.depth_chart d
      where d.roster_player_id = r.id and d.slot in ('QB', 'KR_R1'))
    from public.roster_players r where r.user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'$$,
  $$values (7, 2)$$,
  'the kept row keeps its jersey and takes over the depth spots'
);
select is(
  (select count(*)::int from public.roster_players where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'),
  0,
  'the typed-in row is gone'
);

-- Players see none of it
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.roster_players) + (select count(*)::int from public.depth_chart),
  0,
  'a player reads no roster or depth chart, not even their own row'
);
select throws_ok(
  $$insert into public.roster_players (team_id, name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Me')$$,
  '42501', null,
  'a player cannot add to the roster'
);

-- Removing the membership removes the roster row and its depth spots
reset role;
delete from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14';
select is(
  (select count(*)::int from public.roster_players where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14')
  + (select count(*)::int from public.depth_chart where slot = 'FS'),
  0,
  'a removed player leaves no roster row or depth spot'
);

set local role anon;
select throws_ok($$select count(*) from public.roster_players$$, '42501', null, 'anon reads nothing');

select * from finish();
rollback;
