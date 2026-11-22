begin;
select plan(43);
set local search_path = public, extensions, auth;

-- Team A: 11 head coach, 12 offensive coordinator, 15 defensive coordinator, 13 a QB with
-- an assigned book, 14 a WR with nothing assigned. Team B: 21 head coach.
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

-- The transcode worker: no signed-in user.
create function pg_temp.worker()
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

do $$
begin
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'oc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'dc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'wr@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'hc-b@example.com');
end $$;

insert into public.teams (id, name, season_ends_on, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Team B', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');

insert into public.memberships (team_id, user_id, role, position, coordinates) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null, 'offense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'coach', null, 'defense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'player', 'WR', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null);

-- Team A: a defense week folder (where film goes) and an offense book assigned to the QB
-- with one published play, P1. Team B: a folder, a play and a look.
insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Week of Nov 23', 'defense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'QB Install', 'offense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd09', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'B folder', null,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
insert into public.plays (id, team_id, name, side, current_version, published_at) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Their Mesh', 'offense', 1, now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Their Power', 'offense', 1, now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc09', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'B play', 'offense', 1, now());
insert into public.scout_looks (id, team_id, side, name) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Cover 3'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee09', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'defense', 'B look');
insert into public.playbook_plays (playbook_id, play_id, sort) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 0);
insert into public.assignments (team_id, playbook_id, assignee_user, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');

-- Team B film, made by the worker so the cross-team checks have something to point at.
select pg_temp.worker();
insert into public.film (id, team_id, title, size_bytes)
values ('ffffffff-ffff-4fff-8fff-ffffffffff09', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'B game', 1000);

set local role authenticated;

-- 1. Upload.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$insert into public.film (team_id, folder_id, title, opponent, game_date, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
            'Lincoln at Central', 'Lincoln High', '2026-11-20', 4000000000,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'head coach adds film to the week folder'
);
select set_config('test.film', (select id::text from public.film where title = 'Lincoln at Central'), true);
select results_eq(
  $$select status, storage_key, proxy_key from public.film where id = current_setting('test.film')::uuid$$,
  $$values ('uploading'::text,
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/original',
            null::text)$$,
  'new film is uploading, with a key the database chose'
);
select throws_ok(
  $$insert into public.film (team_id, title, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Too big', 21474836481,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', null,
  'one file is at most 20 GiB'
);
select throws_ok(
  $$insert into public.film (team_id, folder_id, title, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'dddddddd-dddd-4ddd-8ddd-dddddddddd09', 'Theirs', 1000,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '42501', null,
  'a coach cannot add film to another team'
);
select throws_ok(
  $$insert into public.film (team_id, folder_id, title, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd09', 'Wrong folder', 1000,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', null,
  'film cannot be filed in another team''s folder'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select throws_ok(
  $$insert into public.film (team_id, folder_id, title, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'OC film', 1000,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  '42501', null,
  'the OC cannot add film to a defense folder'
);
select is(
  (select count(*)::int from public.film where id = current_setting('test.film')::uuid),
  1,
  'the OC still reads the film'
);
update public.film set title = 'Renamed' where id = current_setting('test.film')::uuid;
select is(
  (select title from public.film where id = current_setting('test.film')::uuid),
  'Lincoln at Central',
  'the OC cannot rename film in a defense folder'
);

-- 2. Team quota.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
reset role;
update public.teams set film_quota_bytes = 5000000000 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
set local role authenticated;
select throws_ok(
  $$insert into public.film (team_id, title, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Over quota', 2000000000,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '53400', null,
  'a film that would pass the team quota is refused'
);
select lives_ok(
  $$insert into public.film (team_id, title, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Under quota', 1000000000,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'a film that fits the quota is accepted'
);

-- 3. Storage: the uploader writes the original only, only while uploading.
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('film', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/original')$$,
  'head coach uploads the original'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('film', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/proxy.mp4')$$,
  '42501', null,
  'a coach cannot write the proxy'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('film', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02/ffffffff-ffff-4fff-8fff-ffffffffff09/original')$$,
  '42501', null,
  'a coach cannot upload into another team''s film'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('film', 'not-a-team/x/original')$$,
  '42501', null,
  'a malformed key is refused'
);

-- 4. Status: the coach finishes the upload, the worker does the rest.
select lives_ok(
  $$update public.film set status = 'processing' where id = current_setting('test.film')::uuid$$,
  'the uploader marks the upload finished'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('film', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/original2')$$,
  '42501', null,
  'nothing more is uploaded once processing'
);
select throws_ok(
  $$update public.film set status = 'ready' where id = current_setting('test.film')::uuid$$,
  '42501', null,
  'a coach cannot mark film ready'
);
select throws_ok(
  $$update public.film set proxy_key = 'x' where id = current_setting('test.film')::uuid$$,
  '42501', null,
  'a coach cannot set the proxy key'
);

reset role;
select pg_temp.worker();
select lives_ok(
  $$update public.film
      set status = 'ready',
          proxy_key = team_id || '/' || id || '/proxy.mp4',
          duration_ms = 9000000
    where id = current_setting('test.film')::uuid$$,
  'the worker marks the film ready with its proxy'
);
set local role authenticated;

-- 5. Clips.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select lives_ok(
  $$insert into public.film_clips (team_id, film_id, play_number, start_ms, end_ms, side, down, distance, formation, coverage)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.film')::uuid, 1, 12000, 19000,
            'offense', 1, 10, 'Trips Rt', 'Cover 3')$$,
  'any coach marks a play'
);
select lives_ok(
  $$insert into public.film_clips (team_id, film_id, play_number, start_ms, end_ms)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.film')::uuid, 2, 40000, 47000)$$,
  'a second play'
);
select set_config('test.clip1', (select id::text from public.film_clips where play_number = 1), true);
select set_config('test.clip2', (select id::text from public.film_clips where play_number = 2), true);
select throws_ok(
  $$insert into public.film_clips (team_id, film_id, start_ms, end_ms)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.film')::uuid, 5000, 5000)$$,
  '23514', null,
  'a clip ends after it starts'
);
select throws_ok(
  $$insert into public.film_clips (team_id, film_id, start_ms, end_ms)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.film')::uuid, 8999000, 9001000)$$,
  '23514', null,
  'a clip ends inside the film'
);
select throws_ok(
  $$update public.film_clips set film_id = 'ffffffff-ffff-4fff-8fff-ffffffffff09'
    where id = current_setting('test.clip1')::uuid$$,
  '42501', null,
  'a clip stays on its film'
);

-- 6. Cross-team links are refused.
select throws_ok(
  $$insert into public.film_clips (team_id, film_id, start_ms, end_ms)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'ffffffff-ffff-4fff-8fff-ffffffffff09', 0, 1000)$$,
  '23503', null,
  'a clip cannot point at another team''s film'
);
select throws_ok(
  $$update public.film_clips set play_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc09'
    where id = current_setting('test.clip1')::uuid$$,
  '23503', null,
  'a clip cannot link another team''s play'
);
select throws_ok(
  $$update public.film_clips set look_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee09'
    where id = current_setting('test.clip1')::uuid$$,
  '23503', null,
  'a clip cannot link another team''s look'
);
select lives_ok(
  $$update public.film_clips
      set look_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
          play_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02'
    where id = current_setting('test.clip2')::uuid$$,
  'a clip links a same-team look and an unassigned play'
);

-- 7. Players see nothing until a clip's play is assigned to them.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select is((select count(*)::int from public.film), 0, 'the QB sees no film yet');
select is((select count(*)::int from public.film_clips), 0, 'the QB sees no clips yet');
select is(
  app.can_read_film_object('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/proxy.mp4'),
  false,
  'the QB cannot stream the proxy yet'
);
select throws_ok(
  $$insert into public.film_clips (team_id, film_id, start_ms, end_ms)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.film')::uuid, 0, 1000)$$,
  '42501', null,
  'a player cannot mark plays'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15');
select lives_ok(
  $$update public.film_clips set play_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'
    where id = current_setting('test.clip1')::uuid$$,
  'the DC links play 1 to the QB''s assigned play'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select results_eq(
  $$select id from public.film_clips$$,
  $$values (current_setting('test.clip1')::uuid)$$,
  'the QB sees only the clip of their assigned play'
);
select is((select count(*)::int from public.film), 1, 'the QB reads that film''s row');
select is(
  app.can_read_film_object('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/proxy.mp4'),
  true,
  'the QB streams the proxy'
);
select is(
  app.can_read_film_object('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/original'),
  false,
  'the QB never reads the original'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14');
select is((select count(*)::int from public.film) + (select count(*)::int from public.film_clips), 0,
  'a player with nothing assigned sees no film and no clips');
select is(
  app.can_read_film_object('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/proxy.mp4'),
  false,
  'nor streams the proxy'
);

-- 8. Another team sees nothing.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select is(
  (select count(*)::int from public.film where team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
    + (select count(*)::int from public.film_clips),
  0,
  'Team B sees none of Team A''s film or clips'
);
select is(
  app.can_read_film_object('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01/' || current_setting('test.film') || '/original'),
  false,
  'Team B cannot read Team A''s film files'
);

-- 9. Deleting a film removes its clips.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$delete from public.film where id = current_setting('test.film')::uuid$$,
  'head coach deletes the film'
);
select is((select count(*)::int from public.film_clips), 0, 'its clips go with it');

select * from finish();
rollback;
