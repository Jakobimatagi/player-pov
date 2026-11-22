begin;
select plan(28);
set local search_path = public, extensions, auth;

-- Team A: 11 head coach, 12 offensive coordinator, 15 defensive coordinator, 16 a coach with
-- no side, 13 a player. Team B: 21 its head coach.
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

-- Eleven offense spots (Gun Trips Right) and eleven defense spots (4-3 Over), kept in
-- settings so the authenticated role can read them.
select set_config('test.offense', '[
    {"slot":"lt","dx":-0.5,"dy":4},{"slot":"lg","dx":-0.5,"dy":2},{"slot":"c","dx":-0.5,"dy":0},
    {"slot":"rg","dx":-0.5,"dy":-2},{"slot":"rt","dx":-0.5,"dy":-4},{"slot":"qb","dx":-5,"dy":0},
    {"slot":"rb","dx":-6,"dy":-1},{"slot":"x","dx":-1,"dy":14},{"slot":"z","dx":-1,"dy":-16},
    {"slot":"h","dx":-1,"dy":-8},{"slot":"y","dx":-0.5,"dy":-6,"label":"Y","color":"orange"}
  ]', true);
select set_config('test.defense', '[
    {"slot":"de1","dx":1.6,"dy":6.5,"label":"DE"},{"slot":"dt1","dx":1.6,"dy":2.5,"label":"DT"},
    {"slot":"dt2","dx":1.6,"dy":-2.5,"label":"DT"},{"slot":"de2","dx":1.6,"dy":-6.5,"label":"DE"},
    {"slot":"w","dx":4.5,"dy":7},{"slot":"m","dx":4.5,"dy":0},{"slot":"s","dx":4.5,"dy":-7},
    {"slot":"cb1","dx":7,"dy":16},{"slot":"cb2","dx":7,"dy":-16},{"slot":"fs","dx":12,"dy":4},
    {"slot":"ss","dx":10,"dy":-5}
  ]', true);

do $$
begin
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'oc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'dc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', 'coach@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'qb@example.com');
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', 'coach', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null);

insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base O', 'offense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');

set local role authenticated;

-- Side rules.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.formation_templates (id, team_id, side, name, spots)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Our Trips', current_setting('test.offense')::jsonb)$$,
  'OC saves an offense template'
);
select is(
  (select created_by from public.formation_templates where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'::uuid,
  'created_by is the caller'
);
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Our 43', current_setting('test.defense')::jsonb)$$,
  '42501', null,
  'OC cannot save a defense template'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.formation_templates (id, team_id, side, name, spots)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Our 43', current_setting('test.defense')::jsonb)$$,
  'DC saves a defense template'
);
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'DC Trips', current_setting('test.offense')::jsonb)$$,
  '42501', null,
  'DC cannot save an offense template'
);
select results_eq(
  $$with c as (update public.formation_templates set name = 'Stolen' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'DC cannot rename an offense template'
);
select is((select count(*)::int from public.formation_templates), 2, 'DC reads both sides');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Our Nickel', current_setting('test.defense')::jsonb)$$,
  'a coach with no side saves defense'
);
select lives_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Our Wing', current_setting('test.offense')::jsonb)$$,
  'a coach with no side saves offense'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'HC Bear', current_setting('test.defense')::jsonb)$$,
  'head coach saves defense'
);

-- Names and shape.
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'our trips', current_setting('test.offense')::jsonb)$$,
  '23505', null,
  'a name already used on the team and side is refused, ignoring case'
);
select lives_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Our Trips', current_setting('test.defense')::jsonb)$$,
  'the same name on the other side is fine'
);
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Ten', current_setting('test.offense')::jsonb - 10)$$,
  '23514', null,
  'fewer than eleven spots is refused'
);
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Odd slot',
      jsonb_set(current_setting('test.offense')::jsonb, '{10,slot}', '"wing"'))$$,
  '23514', null,
  'an unknown slot is refused'
);
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Two Xs',
      jsonb_set(current_setting('test.offense')::jsonb, '{10,slot}', '"x"'))$$,
  '23514', null,
  'a repeated slot is refused'
);
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Off field',
      jsonb_set(current_setting('test.offense')::jsonb, '{7,dy}', '40'))$$,
  '23514', null,
  'a spot off the field is refused'
);
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Offense slots', current_setting('test.offense')::jsonb)$$,
  '23514', null,
  'offense slots on a defense template are refused'
);

-- Players and other teams.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is((select count(*)::int from public.formation_templates), 0, 'a player reads no templates');
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Player made', current_setting('test.offense')::jsonb)$$,
  '42501', null,
  'a player cannot save a template'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21","role":"authenticated"}', true);
select is((select count(*)::int from public.formation_templates), 0, 'another team reads none of them');
select throws_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Planted', current_setting('test.offense')::jsonb)$$,
  '42501', null,
  'another team cannot save into this team'
);
select results_eq(
  $$with c as (update public.formation_templates set archived_at = now() returning 1) select count(*)::int from c$$,
  $$values (0)$$,
  'another team cannot archive them'
);

-- Base alignment.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$update public.playbooks set base_formation = 'tpl:eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'$$,
  'a book takes an offense template as its base alignment'
);
select throws_ok(
  $$update public.playbooks set base_formation = 'tpl:eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'$$,
  '23514', null,
  'a defense template cannot be a base alignment'
);

-- Archive instead of delete; the book keeps its base alignment.
select results_eq(
  $$with c as (update public.formation_templates set archived_at = now() where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' returning 1) select count(*)::int from c$$,
  $$values (1)$$,
  'OC archives an offense template'
);
select is(
  (select base_formation from public.playbooks where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'),
  'tpl:eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
  'the book still points at the archived template'
);
select throws_ok(
  $$delete from public.formation_templates where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'$$,
  '42501', null,
  'templates cannot be deleted'
);
select lives_ok(
  $$insert into public.formation_templates (team_id, side, name, spots)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense', 'Our Trips', current_setting('test.offense')::jsonb)$$,
  'an archived template frees its name'
);

select * from finish();
rollback;
