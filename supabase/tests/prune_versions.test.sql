begin;
select plan(8);
set local search_path = public, extensions, auth;

-- Team A: 11 head coach saves one play (and its look) 8 times.
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

-- One save through the app's RPC. Returns the new play version.
create function pg_temp.save(n int)
returns int
language sql
as $$
  select version from public.save_play_version(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    (select id from public.plays where name = 'Flood'),
    (select current_version from public.plays where name = 'Flood'),
    'Flood',
    jsonb_build_object('side', 'offense', 'save', n),
    jsonb_build_object('players', jsonb_build_array(jsonb_build_object('waypoints', jsonb_build_array(n)))),
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test',
    (select default_look_id from public.plays where name = 'Flood'),
    (select l.current_version from public.scout_looks l join public.plays p on p.default_look_id = l.id where p.name = 'Flood'),
    jsonb_build_object('side', 'defense', 'name', 'Cover', 'save', n),
    'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
  )
$$;
grant execute on function pg_temp.save(int) to authenticated;

select pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc@example.com');
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
insert into public.memberships (team_id, user_id, role) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  for g in 1..5 loop
    perform pg_temp.save(g);
  end loop;
end $$;
select is((select current_version from public.plays where name = 'Flood'), 5, 'five saves make version 5');
select results_eq(
  $$select version from public.play_versions order by version$$,
  $$values (1), (2), (3), (4), (5)$$,
  'five versions are all kept'
);

select pg_temp.save(6);
select pg_temp.save(7);
select is(pg_temp.save(8), 8, 'the eighth save is version 8');

select results_eq(
  $$select version from public.play_versions order by version$$,
  $$values (4), (5), (6), (7), (8)$$,
  'after 8 saves the play keeps version 8 and the 4 before it'
);
select results_eq(
  $$select version from public.scout_look_versions order by version$$,
  $$values (4), (5), (6), (7), (8)$$,
  'its look keeps the same window'
);
select is(
  (select pv.compiled -> 'players' -> 0 -> 'waypoints' ->> 0
   from public.play_versions pv join public.plays p on p.id = pv.play_id and pv.version = p.current_version),
  '8',
  'the current version is the latest save'
);
select is(pg_temp.save(9), 9, 'saving against the current version still works after pruning');

reset role;

-- current_version is never pruned, even if it points at an old version.
update public.plays set current_version = 6 where name = 'Flood';
insert into public.play_versions (play_id, version, source, compiled, source_schema, compiled_schema, compiler_version, checksum)
select id, 12, '{}', '{}', 1, 1, 'test', 'x' from public.plays where name = 'Flood';
select results_eq(
  $$select version from public.play_versions order by version$$,
  $$values (6), (8), (9), (12)$$,
  'a jump to version 12 prunes up to 7, but keeps current version 6'
);

select * from finish();
rollback;
