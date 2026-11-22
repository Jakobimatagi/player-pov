begin;
select plan(13);
set local search_path = public, extensions, auth;

-- Team A: 11 head coach, 12 OC, 17 special teams coordinator, 14 player.
-- Team B: 21 head coach, 22 OC, no special teams coordinator.
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
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa17', 'st@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'k@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'hc2@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22', 'oc2@example.com');
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa17', 'coach', null, 'special'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'player', 'K', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22', 'coach', null, 'offense');

insert into public.roster_players (id, team_id, name, position) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Their K', 'K');

create temp table kid as
select id from public.roster_players where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14';
grant select on kid to authenticated;

select throws_ok(
  $$update public.memberships set coordinates = 'special'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14'$$,
  '23514', null,
  'a player cannot be special teams coordinator'
);

set local role authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa17', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa17","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'KO_K', array[(select id from kid)])$$,
  'special teams coordinator sets the kickoff kicker'
);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'PAT_K', array[(select id from kid)])$$,
  'special teams coordinator sets the PAT kicker'
);
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'QB', array[(select id from kid)])$$,
  '42501', null,
  'special teams coordinator cannot set offense depth'
);
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'K', array[(select id from kid)])$$,
  '23514', null,
  'the old shared K slot is gone'
);
select lives_ok(
  $$insert into public.playbooks (team_id, name, side)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Kicking game', 'special')$$,
  'special teams coordinator creates a special teams playbook'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'FG_K', array[(select id from kid)])$$,
  '42501', null,
  'with a special teams coordinator, the OC cannot set special teams'
);
select throws_ok(
  $$insert into public.playbooks (team_id, name, side)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'OC kicks', 'special')$$,
  '42501', null,
  'the OC cannot create a special teams playbook'
);
select is((select count(*)::int from public.depth_chart), 2, 'the OC still reads special teams depth');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'PR_R', array[(select id from kid)])$$,
  'head coach sets special teams'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'KO_K',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'::uuid])$$,
  'with no special teams coordinator, special teams stay shared'
);
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'FS',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'::uuid])$$,
  '42501', null,
  'but the OC still cannot set defense'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_depth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'KO_K', array[(select id from kid)])$$,
  '42501', null,
  'a player cannot set special teams'
);

select * from finish();
rollback;
