begin;
select plan(40);
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

create function pg_temp.act_as(uid text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', uid, true);
  select set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated"}', true);
$$;
grant execute on function pg_temp.act_as(text) to authenticated;

do $$
begin
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'oc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'dc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'fs@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 't2@example.com');
end $$;

insert into public.profiles (user_id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'Coach Reyes'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'Coach Patel')
on conflict (user_id) do update set display_name = excluded.display_name;

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

-- Players with no account: one on Team A, one on Team B.
insert into public.roster_players (id, team_id, name, jersey, position) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Backup QB', 10, 'QB'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Their QB', 3, 'QB');

create temp table ids as
select user_id, id from public.roster_players where user_id is not null;
grant select on ids to authenticated;

-- Depth spots: QB starter, FS starter.
insert into public.depth_chart (team_id, slot, rank, roster_player_id)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'QB', 1, id from ids
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13';
insert into public.depth_chart (team_id, slot, rank, roster_player_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'QB', 2, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01');
insert into public.depth_chart (team_id, slot, rank, roster_player_id)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'FS', 1, id from ids
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14';

create temp table notes (label text primary key, id uuid);
grant select, insert on notes to authenticated;

set local role authenticated;

-- Any staff member writes notes on any player
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select lives_ok(
  $$with n as (
      insert into public.depth_notes (team_id, roster_player_id, slot, body, shared)
      select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id, 'QB', '  Reads the safety well. Speed up the drop.  ', true
      from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'
      returning id)
    insert into notes select 'oc_qb_shared', id from n$$,
  'the OC adds a shared note on a QB'
);
select lives_ok(
  $$with n as (
      insert into public.depth_notes (team_id, roster_player_id, body)
      select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id, 'Staff only: watch his footwork.'
      from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'
      returning id)
    insert into notes select 'oc_qb_private', id from n$$,
  'the OC adds a staff-only note (share defaults off)'
);
select lives_ok(
  $$with n as (
      insert into public.depth_notes (team_id, roster_player_id, slot, body)
      select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id, 'FS', 'Takes good angles.'
      from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'
      returning id)
    insert into notes select 'oc_fs', id from n$$,
  'the OC writes on a defensive player: notes are feedback, not a depth change'
);
select results_eq(
  $$select created_by::text, body, shared, shared_at is not null
    from public.depth_notes where id = (select id from notes where label = 'oc_qb_shared')$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'Reads the safety well. Speed up the drop.', true, true)$$,
  'author is stamped, body trimmed, shared_at set on share'
);
select is(
  (select shared_at from public.depth_notes where id = (select id from notes where label = 'oc_qb_private')),
  null,
  'a staff-only note has no shared_at'
);
select throws_ok(
  $$insert into public.depth_notes (team_id, roster_player_id, body, created_by)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id, 'Forged', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'
    from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'$$,
  '42501', null,
  'a coach cannot pick the author'
);
select throws_ok(
  $$insert into public.depth_notes (team_id, roster_player_id, body)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', repeat('x', 1001))$$,
  '23514', null,
  'notes stop at 1000 characters'
);
select throws_ok(
  $$insert into public.depth_notes (team_id, roster_player_id, body)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', '   ')$$,
  '23514', null,
  'a blank note is rejected'
);
select throws_ok(
  $$insert into public.depth_notes (team_id, roster_player_id, slot, body)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'XX', 'Hi')$$,
  '23514', null,
  'a note slot must be a depth chart position'
);
select throws_ok(
  $$insert into public.depth_notes (team_id, roster_player_id, body)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'Hi')$$,
  '42501', null,
  'a coach cannot write on another team''s player'
);
select throws_ok(
  $$insert into public.depth_notes (team_id, roster_player_id, body)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'Hi')$$,
  '23503', null,
  'a note cannot point at another team''s roster row'
);
select lives_ok(
  $$with n as (
      insert into public.depth_notes (team_id, roster_player_id, body)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
              'No account yet. Strong arm.')
      returning id)
    insert into notes select 'typed_in', id from n$$,
  'a coach writes on a player with no account'
);

-- Every coach reads every note; only the author or head coach changes one
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15');
select is((select count(*)::int from public.depth_notes), 4, 'the DC reads every note on the team');
select is(
  (select count(*)::int from public.team_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  4,
  'team_depth_notes lists them for staff'
);
select is(
  (select author_name from public.team_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
    where id = (select id from notes where label = 'oc_fs')),
  'Coach Patel',
  'team_depth_notes names the author'
);
select results_eq(
  $$with c as (update public.depth_notes set body = 'Changed'
     where id = (select id from notes where label = 'oc_fs') returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'the DC cannot edit the OC''s note'
);
select results_eq(
  $$with c as (update public.depth_notes set shared = true
     where id = (select id from notes where label = 'oc_qb_private') returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'the DC cannot share the OC''s note (sharing is an edit)'
);
select results_eq(
  $$with c as (delete from public.depth_notes
     where id = (select id from notes where label = 'oc_fs') returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'the DC cannot delete the OC''s note'
);

select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select results_eq(
  $$with c as (update public.depth_notes set body = 'Takes good angles. Tackle lower.'
     where id = (select id from notes where label = 'oc_fs') returning 1) select count(*)::int from c$$,
  $$values (1)$$,
  'the author edits their note'
);
select throws_ok(
  $$update public.depth_notes set created_by = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15'
    where id = (select id from notes where label = 'oc_fs')$$,
  '42501', null,
  'the author cannot hand the note to someone else'
);
select throws_ok(
  $$update public.depth_notes set roster_player_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'
    where id = (select id from notes where label = 'oc_fs')$$,
  '42501', null,
  'a note cannot be moved to another player'
);

select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select results_eq(
  $$with c as (update public.depth_notes set shared = true
     where id = (select id from notes where label = 'oc_fs') returning shared_at is not null)
    select * from c$$,
  $$values (true)$$,
  'the head coach shares the OC''s note and shared_at is set'
);

-- Other teams see nothing
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select is(
  (select count(*)::int from public.depth_notes)
  + (select count(*)::int from public.team_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'another team''s coach reads no notes'
);
select results_eq(
  $$with c as (delete from public.depth_notes returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'another team''s coach deletes nothing'
);

-- The player reads their own spots and shared notes, nothing else
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select is(
  (select count(*)::int from public.depth_notes)
  + (select count(*)::int from public.depth_chart)
  + (select count(*)::int from public.roster_players)
  + (select count(*)::int from public.team_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'a player reads no depth_notes, depth_chart or roster rows directly'
);
select results_eq(
  $$select slot, rank::int, depth from public.my_depth_spots('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values ('QB', 1, 2)$$,
  'my_depth_spots returns the player''s own spot, rank and depth'
);
select results_eq(
  $$select body, author_name from public.my_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values ('Reads the safety well. Speed up the drop.', 'Coach Patel')$$,
  'my_depth_notes returns only the player''s shared notes, with the author'
);
select throws_ok(
  $$insert into public.depth_notes (team_id, roster_player_id, body)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', id, 'I am the best'
    from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'$$,
  '42501', null,
  'a player cannot write a note'
);
select is(
  (select count(*)::int from public.my_depth_spots('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'))
  + (select count(*)::int from public.my_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02')),
  0,
  'a player reads nothing for a team they are not on'
);

select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14');
select results_eq(
  $$select body from public.my_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values ('Takes good angles. Tackle lower.')$$,
  'the FS reads only the note on themselves, not the QB''s'
);

-- Unsharing hides the note again
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select results_eq(
  $$with c as (update public.depth_notes set shared = false
     where id = (select id from notes where label = 'oc_fs') returning shared_at) select * from c$$,
  $$values (null::timestamptz)$$,
  'unsharing clears shared_at'
);
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14');
select is(
  (select count(*)::int from public.my_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  0,
  'the player no longer reads an unshared note'
);

-- Merge carries a typed-in player's notes to the account row
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$select public.merge_roster_players(
      (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01')$$,
  'head coach merges the typed-in row into the account row'
);
select results_eq(
  $$select roster_player_id, created_by::text, shared from public.depth_notes
    where id = (select id from notes where label = 'typed_in')$$,
  $$select id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', false from ids
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'$$,
  'the typed-in player''s note moves to the account row, author and share state kept'
);
select lives_ok(
  $$update public.depth_notes set shared = true where id = (select id from notes where label = 'typed_in')$$,
  'the head coach shares the merged note'
);
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select is(
  (select count(*)::int from public.my_depth_notes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  2,
  'after the merge the player reads the note written before they had an account'
);

-- Head coach deletes any note
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select results_eq(
  $$with c as (delete from public.depth_notes
     where id = (select id from notes where label = 'oc_qb_private') returning 1) select count(*)::int from c$$,
  $$values (1)$$,
  'the head coach deletes another coach''s note'
);

-- Removing a membership removes that player's notes
select lives_ok(
  $$select public.delete_member_data('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13')$$,
  'head coach removes the QB'
);
reset role;
select is(
  (select count(*)::int from public.depth_notes n
    where n.roster_player_id = (select id from ids where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13')),
  0,
  'a removed player leaves no depth notes'
);

set local role anon;
select throws_ok($$select count(*) from public.depth_notes$$, '42501', null, 'anon reads nothing');

select * from finish();
rollback;
