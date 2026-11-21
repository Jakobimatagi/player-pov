begin;
select plan(25);
set local search_path = public, extensions, auth;

-- Users: 11 head coach, 12 offensive coordinator, 15 defensive coordinator,
-- 13 QB (assigned the offense book).
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

-- An offense play: QB and X on our side, FS in the scout look.
insert into public.plays (id, team_id, name, side, current_version) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Flood', 'offense', 1);
insert into public.play_versions (
  play_id, version, source, compiled, source_schema, compiled_schema, compiler_version, checksum
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 1, '{}'::jsonb,
  '{"players":[{"id":"qb","team":"offense"},{"id":"x","team":"offense"},{"id":"fs","team":"defense"}]}'::jsonb,
  1, 1, 'test', 'x'
);
insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base O', 'offense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
insert into public.playbook_plays (playbook_id, play_id, sort) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 0);
insert into public.assignments (team_id, playbook_id, assignee_user) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');

set local role authenticated;

-- A new play is a draft. The assigned QB can't see it.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is((select count(*)::int from public.plays), 0, 'player cannot see a draft play');
select is((select count(*)::int from public.play_versions), 0, 'player cannot read a draft play version');
select throws_ok(
  $$select public.publish_play('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  '42501', 'forbidden',
  'player cannot publish'
);

-- The OC writes the QB fully and X partly.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.position_rules
      (play_id, slot, team_id, side, alignment, assignment, adjustment, key_read, recognize, react)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'qb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense',
      'Gun, 5 yds', 'Flood read: corner, flat, check', 'vs 2-high, peek the corner first',
      'Flat defender', 'Sinks = flat open; widens = corner window', 'Throw on the hitch of the drop')$$,
  'OC writes all six for the QB'
);
select lives_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side, alignment, assignment, key_read)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'x', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense',
      'Top of numbers', 'Clear-out go', '   ')$$,
  'OC writes part of X'
);
reset role;
select set_eq(
  $$select slot from app.play_rule_gaps('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  $$values ('x')$$,
  'only X is missing answers; the scout-look FS is not required'
);
select is(
  (select missing from app.play_rule_gaps('cccccccc-cccc-4ccc-8ccc-cccccccccc01')),
  array['adjustment', 'read', 'recognize', 'react'],
  'a blank or whitespace answer counts as missing'
);
set local role authenticated;
select throws_ok(
  $$select public.publish_play('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  '23514', null,
  'an incomplete play cannot be published'
);

-- The DC doesn't own offense plays.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15","role":"authenticated"}', true);
select throws_ok(
  $$select public.publish_play('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  '42501', null,
  'DC cannot publish an offense play'
);

-- The OC finishes X and publishes.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select lives_ok(
  $$update public.position_rules
    set adjustment = 'vs press, outside release', key_read = 'Corner leverage',
        recognize = 'Bail = run him off', react = 'Stack and stay vertical'
    where slot = 'x'$$,
  'OC finishes X'
);
reset role;
select ok(app.play_is_complete('cccccccc-cccc-4ccc-8ccc-cccccccccc01'), 'the play is complete');
set local role authenticated;
select lives_ok(
  $$select public.publish_play('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  'OC publishes the complete play'
);
select isnt(
  (select published_at from public.plays where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'),
  null,
  'published_at is stamped'
);
select throws_ok(
  $$update public.plays set published_at = null where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'$$,
  '42501', null,
  'staff cannot write published_at directly'
);

-- Now the QB reads the play and every rule on it.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is((select count(*)::int from public.plays), 1, 'player sees the published play');
select is((select count(*)::int from public.position_rules), 2, 'player reads the rules on it');

-- A published play keeps every answer.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","role":"authenticated"}', true);
select throws_ok(
  $$update public.position_rules set react = '' where slot = 'qb'$$,
  '23514', null,
  'clearing an answer on a published play is refused'
);
select throws_ok(
  $$delete from public.position_rules where slot = 'x'$$,
  '23514', null,
  'deleting a rule on a published play is refused'
);
select lives_ok(
  $$update public.position_rules set notes = null, react = 'Throw it on time' where slot = 'qb'$$,
  'rewording an answer and clearing coaching points is fine'
);

-- A new version that adds a running back with no rules sends the play back to Draft.
reset role;
insert into public.play_versions (
  play_id, version, source, compiled, source_schema, compiled_schema, compiler_version, checksum
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 2, '{}'::jsonb,
  '{"players":[{"id":"qb","team":"offense"},{"id":"x","team":"offense"},{"id":"rb","team":"offense"},{"id":"fs","team":"defense"}]}'::jsonb,
  1, 1, 'test', 'x'
);
update public.plays set current_version = 2 where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
select is(
  (select published_at from public.plays where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'),
  null,
  'a version with a new unanswered position reverts to Draft'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13","role":"authenticated"}', true);
select is((select count(*)::int from public.plays), 0, 'player loses the play while it is a draft');

-- The head coach answers for the RB, publishes, then unpublishes.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","role":"authenticated"}', true);
insert into public.position_rules
  (play_id, slot, team_id, side, alignment, assignment, adjustment, key_read, recognize, react)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'rb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'offense',
  'Strong side, heels at 7', 'Check release to the flat', 'vs pressure, stay in',
  'Mike linebacker', 'Mike blitzes = block him', 'No blitz = release to the flat');
select lives_ok(
  $$select public.publish_play('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  'head coach publishes after the RB is answered'
);
select lives_ok(
  $$select public.unpublish_play('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  'head coach unpublishes'
);
select is(
  (select published_at from public.plays where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'),
  null,
  'the play is a draft again'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.publish_play('cccccccc-cccc-4ccc-8ccc-cccccccccc01')$$,
  '42501', null,
  'anon cannot publish'
);

select * from finish();
rollback;
