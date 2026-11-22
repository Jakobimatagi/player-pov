begin;
select plan(37);
set local search_path = public, extensions, auth;

-- Team A users: 11 head coach, 12 offensive coordinator, 15 defensive coordinator,
-- 18 special teams coordinator who runs the LB room, 19 special teams coach with no room,
-- 13 a QB. Team B: 21 head coach.
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

do $$
begin
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'oc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'dc@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa18', 'lb@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19', 'st@example.com');
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

insert into public.memberships (team_id, user_id, role, position, coordinates, coach_groups) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null, null, '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null, 'offense', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15', 'coach', null, 'defense', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa18', 'coach', null, 'special', '{LB}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19', 'coach', null, 'special', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB', null, '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null, null, '{}');

-- A defense book, and two draft defense plays: P1 loose, P2 filed in the defense book.
insert into public.playbooks (id, team_id, name, side, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Base D', 'defense',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
insert into public.plays (id, team_id, name, side, current_version) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Their Power', 'defense', 1),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Our Cover 3', 'defense', 1);
insert into public.play_versions (
  play_id, version, source, compiled, source_schema, compiled_schema, compiler_version, checksum
) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 1, '{}'::jsonb,
   '{"players":[{"id":"mike","team":"defense"}]}'::jsonb, 1, 1, 'test', 'x'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 1, '{}'::jsonb,
   '{"players":[{"id":"mike","team":"defense"}]}'::jsonb, 1, 1, 'test', 'x');
insert into public.playbook_plays (playbook_id, play_id, sort) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', 0);

set local role authenticated;

-- 1. New scout pack.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$select set_config('test.pack', public.create_scout_pack(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Lincoln High', '2026-11-23', 'Week of Nov 23',
      'defense', array['Run Game', 'Pass Game', 'Special Teams', 'Tendencies'])::text, true)$$,
  'head coach makes a scout pack'
);
select results_eq(
  $$select name from public.playbooks where parent_id = current_setting('test.pack')::uuid order by name$$,
  $$values ('Pass Game'), ('Run Game'), ('Special Teams'), ('Tendencies')$$,
  'the pack has the template sections as subfolders'
);
select results_eq(
  $$select team.name, team.kind, pack.side, pack.pack_week
    from public.playbooks pack join public.playbooks team on team.id = pack.parent_id
    where pack.id = current_setting('test.pack')::uuid$$,
  $$values ('Lincoln High'::text, 'opponent'::text, 'defense'::text, '2026-11-23'::date)$$,
  'the pack sits in the opponent folder and carries the studying side'
);
select lives_ok(
  $$select public.create_scout_pack(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'lincoln high', '2026-11-30', 'Week of Nov 30',
      'defense', array['Run Game'])$$,
  'a second week makes a second pack'
);
select is(
  (select count(*)::int from public.playbooks where pack_week is not null
     and parent_id = (select parent_id from public.playbooks where id = current_setting('test.pack')::uuid)),
  2,
  'both weeks live in the same opponent folder; the first is not overwritten'
);
select throws_ok(
  $$select public.create_scout_pack(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Lincoln High', '2026-11-23', 'Week of Nov 23 again',
      'defense', array['Run Game'])$$,
  '23505', null,
  'the same opponent and week cannot be made twice'
);

select set_config('test.run', (select id::text from public.playbooks
  where parent_id = current_setting('test.pack')::uuid and name = 'Run Game'), true);
select set_config('test.pass', (select id::text from public.playbooks
  where parent_id = current_setting('test.pack')::uuid and name = 'Pass Game'), true);
select set_config('test.tend', (select id::text from public.playbooks
  where parent_id = current_setting('test.pack')::uuid and name = 'Tendencies'), true);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select throws_ok(
  $$select public.create_scout_pack(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Central', '2026-11-23', 'Week of Nov 23',
      'defense', array['Run Game'])$$,
  '42501', null,
  'the OC cannot make a defense pack'
);

-- 2. Delegate.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$insert into public.scout_tasks (team_id, folder_id, assignee_user, due_at, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.run')::uuid,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', '2026-11-25T23:59:59Z', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'head coach delegates Run Game to the OC'
);
select lives_ok(
  $$insert into public.scout_tasks (team_id, folder_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.pass')::uuid,
            'LB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'head coach delegates Pass Game to the LB room'
);
select throws_ok(
  $$insert into public.scout_tasks (team_id, folder_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.tend')::uuid,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '23514', 'assignee must be a coach on this team',
  'a task cannot go to a player'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19');
select throws_ok(
  $$insert into public.scout_tasks (team_id, folder_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.tend')::uuid,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19')$$,
  '42501', null,
  'a coach with no rights on the section cannot delegate it'
);

-- 3. The assignee edits inside the section, whatever its side, and nothing outside it.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select lives_ok(
  $$insert into public.playbooks (team_id, name, kind, parent_id, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Inside zone', 'opponent',
            current_setting('test.run')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'the OC adds a folder inside the defense section they own'
);
select lives_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    values (current_setting('test.run')::uuid, 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 0)$$,
  'the OC files a play in their section'
);
select lives_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side, assignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'mike', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Fill A gap')$$,
  'the OC writes defense rules on a play charted in their section'
);
select lives_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    values (current_setting('test.run')::uuid, 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', 1)$$,
  'the OC can file another play in the section'
);
select throws_ok(
  $$insert into public.position_rules (play_id, slot, team_id, side, assignment)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 'mike', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'defense', 'Mine now')$$,
  '42501', null,
  'but a play still filed in the defense book stays the DC''s'
);
select throws_ok(
  $$insert into public.playbooks (team_id, name, kind, parent_id, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Sneaky', 'opponent',
            current_setting('test.pass')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  '42501', null,
  'the OC cannot add to a section they do not own'
);
select throws_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', 3)$$,
  '42501', null,
  'the OC still cannot file in the defense book'
);
select results_eq(
  $$with r as (update public.playbooks set name = 'Run Game (Lincoln)' where id = current_setting('test.run')::uuid returning 1)
    select count(*)::int from r$$,
  $$values (1)$$,
  'the OC renames their section'
);
select throws_ok(
  $$update public.playbooks set archived_at = now() where id = current_setting('test.run')::uuid$$,
  '42501', null,
  'the OC cannot delete the section they were given'
);
select throws_ok(
  $$update public.playbooks set side = 'offense' where id = current_setting('test.run')::uuid$$,
  '42501', null,
  'the OC cannot flip the section to their side'
);

-- 4. A coach with no task and no side rights is rejected by the database.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19');
select throws_ok(
  $$insert into public.playbook_plays (playbook_id, play_id, sort)
    values (current_setting('test.run')::uuid, 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', 5)$$,
  '42501', null,
  'a non-assignee without side rights cannot file in the section'
);
select results_eq(
  $$with r as (update public.playbooks set name = 'Mine' where id = current_setting('test.run')::uuid returning 1)
    select count(*)::int from r$$,
  $$values (0)$$,
  'a non-assignee without side rights cannot rename the section'
);

-- 5. Status: the assignee sets it, but cannot reassign or delete.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select results_eq(
  $$with r as (update public.scout_tasks set status = 'in_progress'
               where folder_id = current_setting('test.run')::uuid returning status_by)
    select status_by from r$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'::uuid)$$,
  'the assignee sets the status and the database records who'
);
select throws_ok(
  $$update public.scout_tasks set assignee_user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19'
    where folder_id = current_setting('test.run')::uuid$$,
  '42501', null,
  'the assignee cannot reassign the task'
);
select results_eq(
  $$with r as (delete from public.scout_tasks where folder_id = current_setting('test.run')::uuid returning 1)
    select count(*)::int from r$$,
  $$values (0)$$,
  'the assignee cannot delete the task'
);

-- 6. A room task: anyone in the room edits and marks it ready.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa18');
select results_eq(
  $$with r as (update public.scout_tasks set status = 'ready'
               where folder_id = current_setting('test.pass')::uuid returning status_by)
    select status_by from r$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa18'::uuid)$$,
  'an LB room coach marks the room''s section ready'
);
select lives_ok(
  $$insert into public.playbooks (team_id, name, kind, parent_id, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Cover 3 beaters', 'opponent',
            current_setting('test.pass')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa18')$$,
  'an LB room coach adds a folder to the room''s section'
);

-- 7. Hand on, one level at a time, only inside the section.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select lives_ok(
  $$insert into public.scout_tasks (team_id, folder_id, parent_task_id, assignee_user, created_by)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', pb.id, t.id,
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'
    from public.playbooks pb, public.scout_tasks t
    where pb.name = 'Inside zone' and t.folder_id = current_setting('test.run')::uuid$$,
  'the OC hands part of their section on'
);
select throws_ok(
  $$insert into public.scout_tasks (team_id, folder_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.tend')::uuid,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  '42501', null,
  'the OC cannot hand on a section they do not own'
);

-- 8. Players and other teams read no tasks and no drafts.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$insert into public.assignments (team_id, playbook_id, assignee_group, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', current_setting('test.run')::uuid, 'QB',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  'the head coach assigns the section to players with the existing assignments'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select is((select count(*)::int from public.scout_tasks), 0, 'a player reads no scout tasks');
select is(
  (select count(*)::int from public.plays where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'),
  0,
  'a player assigned the section still cannot see its draft play'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select is((select count(*)::int from public.scout_tasks), 0, 'another team reads no scout tasks');
select throws_ok(
  $$insert into public.scout_tasks (team_id, folder_id, assignee_user, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', current_setting('test.tend')::uuid,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21')$$,
  '23514', 'section folder is not on this team',
  'a task cannot point at another team''s folder'
);

-- 9. Removing a coach clears their tasks.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select lives_ok(
  $$select public.remove_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12')$$,
  'head coach removes the OC'
);
select is(
  (select count(*)::int from public.scout_tasks where assignee_user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'),
  0,
  'the removed coach has no tasks left'
);

select * from finish();
rollback;
