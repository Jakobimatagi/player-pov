begin;
select plan(15);
set local search_path = public, extensions, auth;

-- Users: 11 head coach, 12 offensive coordinator, 15 defensive coordinator,
-- 13 a player assigned the defense book.
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null);

-- A published defense play: FS on our side, QB and X in the scout look.
insert into public.plays (id, team_id, name, side, current_version, published_at) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Cover 3', 'defense', 1, now());
insert into public.play_versions (
  play_id, version, source, compiled, source_schema, compiled_schema, compiler_version, checksum
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 1, '{}'::jsonb,
  '{"players":[{"id":"qb","team":"offense"},{"id":"x","team":"offense"},{"id":"fs","team":"defense"}]}'::jsonb,
  1, 1, 'test', 'x'
);
insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base D', 'defense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
insert into public.playbook_plays (playbook_id, play_id, sort) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 0);
insert into public.assignments (team_id, playbook_id, assignee_user) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');

set local role authenticated;

-- The DC writes exceptions for the FS at each scope.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, alignment, react)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'structure', '3x1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Align over #3 at 10', 'Carry #3 vertical')$$,
  'DC writes a vs 3x1 exception'
);
select lives_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, adjustment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'personnel', '12', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Rotate down to the TE side')$$,
  'DC writes a vs 12 personnel exception'
);
select lives_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, alignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'look', 'lib:gun-bunch-rt', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Stack behind the bunch at 12')$$,
  'DC writes an exception for one formation'
);
select is(
  (select side from public.position_rule_variants where scope = 'structure'),
  'defense',
  'side is stamped from the play'
);
select throws_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, alignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'structure', 'trips', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'x')$$,
  '23514', null,
  'an unknown structure is refused'
);
select throws_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, alignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'personnel', '5', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'x')$$,
  '23514', null,
  'a malformed personnel group is refused'
);
select throws_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'personnel', '21', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense')$$,
  '23514', null,
  'an exception with no answers is refused'
);
select throws_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, alignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'ss', 'structure', '2x2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'x')$$,
  '23514', null,
  'a slot the play does not have is refused'
);
select results_eq(
  $$with c as (update public.position_rule_variants set react = 'Match #3' where scope = 'structure' returning 1) select count(*)::int from c$$,
  $$values (1)$$,
  'DC edits an exception'
);

-- The OC can't touch defense exceptions.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, alignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'structure', '2x2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'x')$$,
  '42501', null,
  'OC cannot write a defense exception'
);
select results_eq(
  $$with c as (delete from public.position_rule_variants returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'OC cannot delete a defense exception'
);

-- The assigned player reads them; a draft hides them again.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is((select count(*)::int from public.position_rule_variants), 3, 'player reads the exceptions on a published play');
select throws_ok(
  $$insert into public.position_rule_variants (play_id, slot, scope, match, team_id, side, alignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'fs', 'structure', '2x2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'x')$$,
  '42501', null,
  'player cannot write an exception'
);
reset role;
update public.plays set published_at = null;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is((select count(*)::int from public.position_rule_variants), 0, 'player reads no exceptions on a draft');

-- Head coach clears one.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select results_eq(
  $$with c as (delete from public.position_rule_variants where scope = 'look' returning 1) select count(*)::int from c$$,
  $$values (1)$$,
  'head coach deletes an exception'
);

select * from finish();
rollback;
