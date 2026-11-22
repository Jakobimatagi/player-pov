begin;
select plan(9);
set local search_path = public, extensions, auth;

-- Users: 11 head coach, 12 offensive coordinator, 15 defensive coordinator,
-- 13 a QB.
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
end $$;

insert into public.teams (id, name, season_ends_on, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');

insert into public.memberships (team_id, user_id, role, position, coordinates) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null, 'offense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'coach', null, 'defense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null);

-- An offense book, a defense book with a subfolder that inherits its side, and a shared book.
insert into public.playbooks (id, team_id, name, side, parent_id, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base O', 'offense', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base D', 'defense', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd03', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Install', null, null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd04', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Red zone D', null, 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');

set local role authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'QB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'OC assigns the offense book'
);
select throws_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'DB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  '42501', null,
  'OC cannot assign the defense book'
);
select throws_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd04', 'DB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  '42501', null,
  'OC cannot assign a subfolder of the defense book'
);
select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'OC assigns a shared book'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd04', 'DB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15')$$,
  'DC assigns the defense subfolder'
);
select results_eq(
  $$with gone as (delete from public.assignments where playbook_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01' returning 1) select count(*)::int from gone$$,
  $$values (0)$$,
  'DC cannot remove the offense assignment'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13')$$,
  '42501', null,
  'a player cannot assign'
);
select is((select count(*)::int from public.assignments), 2, 'the QB reads the two assignments that reach them');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select results_eq(
  $$with gone as (delete from public.assignments where playbook_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd04' returning 1) select count(*)::int from gone$$,
  $$values (1)$$,
  'head coach removes the defense assignment'
);

select * from finish();
rollback;
