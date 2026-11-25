begin;
select plan(25);
set local search_path = public, extensions, auth;

-- Hudl export film (20261213000000_film_local_clips.sql). Team A: 11 head coach, 12 offensive
-- coordinator, 15 defensive coordinator, 13 QB, 14 WR. Team B: 21 head coach.
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null);

-- An uploaded film on Team A, so the checks that files only go on local film have a clip.
select pg_temp.worker();
insert into public.film (id, team_id, title, size_bytes)
values ('ffffffff-ffff-4fff-8fff-ffffffffff01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Uploaded', 1000);
insert into public.film_clips (id, team_id, film_id, play_number, start_ms, end_ms)
values ('99999999-9999-4999-8999-999999999901', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
        'ffffffff-ffff-4fff-8fff-ffffffffff01', 1, 0, 5000);

set local role authenticated;

-- 1. The game row: no file, no size, nothing counted against storage.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select lives_ok(
  $$insert into public.film (team_id, title, opponent, game_date, source, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'Mountain Ridge vs Corner Canyon', 'Corner Canyon', '2026-10-30', 'hudl_export',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'a coach adds a game from a Hudl export without uploading anything'
);
select set_config('test.game',
  (select id::text from public.film where title = 'Mountain Ridge vs Corner Canyon'), true);
select results_eq(
  $$select status, storage_key, size_bytes, proxy_key
    from public.film where id = current_setting('test.game')::uuid$$,
  $$values ('local'::text, null::text, null::bigint, null::text)$$,
  'an export game is local, with no storage key and no size'
);
select lives_ok(
  $$insert into public.film (team_id, title, source, size_bytes, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Sized', 'hudl_export', 5000,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'a size sent for an export game is dropped, not stored'
);
select is(
  (select size_bytes from public.film where title = 'Sized'),
  null::bigint,
  'the export game keeps no size'
);
select throws_ok(
  $$insert into public.film (team_id, title, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'No size', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  '23514', null,
  'an uploaded film still needs its size'
);
select throws_ok(
  $$update public.film set status = 'ready' where id = current_setting('test.game')::uuid$$,
  '42501', null,
  'a coach cannot move an export game out of local'
);
select throws_ok(
  $$update public.film set source = 'upload' where id = current_setting('test.game')::uuid$$,
  '42501', null,
  'a film keeps its source'
);
select is(
  (select film_used from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')),
  1000::bigint,
  'export games do not count toward film storage'
);

-- 2. One clip per play, 205 of them, through RLS as a coach. Times are inside each clip.
select lives_ok(
  $$insert into public.film_clips (team_id, film_id, play_number, start_ms, end_ms, side, quarter,
      down, distance, hash, yard_line, formation, tags)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.game')::uuid, n, 0,
      6000 + n * 10, case when n % 2 = 0 then 'offense' else 'defense' end, 1 + (n - 1) / 52,
      1 + n % 4, n % 11, 'M', -25, 'Trips Rt', jsonb_build_object('play_type', 'Run')
    from generate_series(1, 205) n$$,
  'a coach adds the 205 plays of the export'
);
select is(
  (select count(*)::int from public.film_clips where film_id = current_setting('test.game')::uuid),
  205,
  'the game has 205 clips'
);
select results_eq(
  $$select play_number, start_ms, end_ms, side, quarter, down, distance, created_by
    from public.film_clips
    where film_id = current_setting('test.game')::uuid and play_number = 7$$,
  $$values (7, 0, 6070, 'defense'::text, 1::smallint, 4::smallint, 7::smallint,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'::uuid)$$,
  'a clip carries its breakdown fields and its importer'
);
select throws_ok(
  $$insert into public.film_clips (team_id, film_id, play_number, start_ms, end_ms)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.game')::uuid, 7, 0, 5000)$$,
  '23505', null,
  'play 7 cannot be added to the game twice'
);
select throws_ok(
  $$insert into public.film_clips (team_id, film_id, start_ms, end_ms)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.game')::uuid, 0, 5000)$$,
  '23514', null,
  'a clip from an export needs its play number'
);

-- 3. Clip files and fingerprints: Wide for every play, End Zone missing on 45 and 95.
select lives_ok(
  $$insert into public.film_clip_files (clip_id, team_id, angle, file_name, size_bytes, sha256)
    select c.id, c.team_id, a.angle,
      a.angle || ' - Clip ' || lpad(c.play_number::text, 3, '0') || '.mp4',
      4000000 + c.play_number,
      encode(extensions.digest(a.angle || c.play_number, 'sha256'), 'hex')
    from public.film_clips c
    cross join (values ('Wide'), ('End Zone')) a (angle)
    where c.film_id = current_setting('test.game')::uuid
      and not (a.angle = 'End Zone' and c.play_number in (45, 95))$$,
  'a coach records each clip''s files and fingerprints'
);
select is(
  (select count(*)::int from public.film_clip_files f
   join public.film_clips c on c.id = f.clip_id
   where c.film_id = current_setting('test.game')::uuid),
  408,
  'the game has 408 clip files'
);
select is(
  (select c.play_number from public.film_clip_files f
   join public.film_clips c on c.id = f.clip_id
   where f.team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'
     and f.sha256 = encode(extensions.digest('Wide' || 12, 'sha256'), 'hex')
     and f.size_bytes = 4000012),
  12,
  're-opening the export finds the saved clip by its fingerprint'
);
select throws_ok(
  $$insert into public.film_clip_files (clip_id, team_id, angle, file_name, size_bytes, sha256)
    select id, team_id, 'Wide', 'again.mp4', 1, repeat('a', 64) from public.film_clips
    where film_id = current_setting('test.game')::uuid and play_number = 1$$,
  '23505', null,
  'a clip has one file per angle'
);
select throws_ok(
  $$insert into public.film_clip_files (clip_id, team_id, angle, file_name, size_bytes, sha256)
    select id, team_id, 'Tight', 'x.mp4', 1, 'not-a-hash' from public.film_clips
    where film_id = current_setting('test.game')::uuid and play_number = 1$$,
  '23514', null,
  'a fingerprint is a hex SHA-256'
);
select throws_ok(
  $$insert into public.film_clip_files (clip_id, team_id, angle, file_name, size_bytes, sha256)
    values ('99999999-9999-4999-8999-999999999901', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'Wide', 'x.mp4', 1, repeat('b', 64))$$,
  '23514', null,
  'a clip on uploaded film has no local files'
);

-- 4. Players and other teams never see file names.
select set_config('test.clip',
  (select id::text from public.film_clips where film_id = current_setting('test.game')::uuid
   and play_number = 1), true);
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select is((select count(*)::int from public.film_clip_files), 0, 'a player reads no clip files');
select throws_ok(
  $$insert into public.film_clip_files (clip_id, team_id, angle, file_name, size_bytes, sha256)
    values (current_setting('test.clip')::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
            'Tight', 'x.mp4', 1, repeat('c', 64))$$,
  '42501', null,
  'a player cannot add clip files'
);
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select is((select count(*)::int from public.film_clip_files), 0, 'another team reads no clip files');
delete from public.film where id = current_setting('test.game')::uuid;
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select is(
  (select count(*)::int from public.film where id = current_setting('test.game')::uuid),
  1,
  'another team cannot delete the game'
);

-- 5. Deleting an export game is a plain delete and takes its clips and files with it.
select lives_ok(
  $$delete from public.film where id = current_setting('test.game')::uuid$$,
  'the head coach deletes the export game'
);
select is(
  (select count(*)::int from public.film_clips where film_id = current_setting('test.game')::uuid)
    + (select count(*)::int from public.film_clip_files),
  0,
  'its clips and files are gone'
);

select * from finish();
rollback;
