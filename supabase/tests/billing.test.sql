begin;
select plan(31);
set local search_path = public, extensions, auth;

-- Team A: 11 head coach, 12 coach, 13 player, on a Team subscription (account 1).
-- Team B: 21 head coach, no account. Teams C and D: 31 head coach of both, on one Program
-- subscription (account 2).
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
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'hc-b@example.com');
  perform pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31', 'hc-program@example.com');
end $$;

insert into public.billing_accounts (id, owner_user_id, stripe_customer_id, plan, status) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'cus_A', 'team', 'active'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31', 'cus_P', 'program', 'active');

insert into public.teams (id, name, season_ends_on, created_by, billing_account_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Team B', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', 'Varsity', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb04', 'JV', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02');

insert into public.memberships (team_id, user_id, role, position) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31', 'head_coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb04', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31', 'head_coach', null);

-- 1. The plans and their limits.
select results_eq(
  $$select id, max_coaches, max_players, max_plays, max_teams, film_bytes_per_team
    from public.plans order by array_position(array['starter', 'team', 'program'], id)$$,
  $$values ('starter'::text, 1, 25, 15, 1, 0::bigint),
           ('team'::text, null::int, null::int, null::int, 1, 10737418240::bigint),
           ('program'::text, null::int, null::int, null::int, 4, 10737418240::bigint)$$,
  'Starter is 1 coach, 25 players, 15 plays, no film; Team and Program are unlimited'
);

-- 2. Effective plan, as the database sees it.
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'team', 'an active Team subscription means Team');
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'), 'starter', 'a team with no account is on Starter');
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03'), 'program', 'Program covers its first team');
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb04'), 'program', 'Program covers its second team');
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99'), 'starter', 'an unknown team is on Starter');

update public.billing_accounts set status = 'trialing' where stripe_customer_id = 'cus_A';
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'team', 'a trial counts as Team');

update public.billing_accounts set status = 'past_due', past_due_since = now() - interval '3 days'
where stripe_customer_id = 'cus_A';
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'team', 'three days past due keeps Team');

update public.billing_accounts set past_due_since = now() - interval '15 days'
where stripe_customer_id = 'cus_A';
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'starter', 'fifteen days past due drops to Starter');

update public.billing_accounts set status = 'canceled', past_due_since = null
where stripe_customer_id = 'cus_A';
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'starter', 'a canceled subscription drops to Starter');

select throws_ok(
  $$update public.billing_accounts set status = 'past_due', past_due_since = null
    where stripe_customer_id = 'cus_A'$$,
  '23514', null,
  'past_due always has a start time'
);

update public.billing_accounts set status = 'active' where stripe_customer_id = 'cus_A';

-- 3. Features.
select ok(app.plan_allows('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'homework'), 'Team includes homework');
select ok(app.plan_allows('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'film'), 'Team includes film');
select ok(not app.plan_allows('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'homework'), 'Starter has no homework');
select ok(not app.plan_allows('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'film'), 'Starter has no film');
select ok(not app.plan_allows('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'warp_drive'), 'an unknown feature is never allowed');

set local role authenticated;

-- 4. Reads.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select results_eq(
  $$select stripe_customer_id, plan, status from public.billing_accounts$$,
  $$values ('cus_A'::text, 'team'::text, 'active'::text)$$,
  'the head coach reads their billing account'
);
select throws_ok(
  $$select 1 from public.plans$$,
  '42501', null,
  'clients do not read the plans table directly'
);
select throws_ok(
  $$select app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  '42501', null,
  'clients do not call plan_of directly'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select is_empty($$select 1 from public.billing_accounts$$, 'an assistant coach does not see billing');

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select is_empty($$select 1 from public.billing_accounts$$, 'a player does not see billing');

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select is_empty($$select 1 from public.billing_accounts$$, 'another team''s head coach does not see this account');

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31');
select results_eq(
  $$select stripe_customer_id from public.billing_accounts$$,
  $$values ('cus_P'::text)$$,
  'the Program head coach reads one account for both teams'
);

-- 5. Writes are the webhook's alone.
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select throws_ok(
  $$update public.billing_accounts set plan = 'program'$$,
  '42501', null,
  'the head coach cannot change their plan'
);
select throws_ok(
  $$insert into public.billing_accounts (plan, status) values ('team', 'active')$$,
  '42501', null,
  'the head coach cannot create a billing account'
);
select throws_ok(
  $$update public.teams set billing_account_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'$$,
  '42501', null,
  'the head coach cannot link their team to another account'
);
select throws_ok(
  $$update public.teams set film_quota_bytes = 999999999999
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'$$,
  '42501', null,
  'the head coach cannot raise their film quota'
);
select throws_ok(
  $$update public.plans set max_plays = null where id = 'starter'$$,
  '42501', null,
  'no client edits a plan'
);
select throws_ok(
  $$select 1 from public.stripe_events$$,
  '42501', null,
  'the webhook log is not readable'
);
select lives_ok(
  $$update public.teams set name = 'Team A Eagles' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'$$,
  'the head coach still renames their team'
);

reset role;

-- 6. Idempotency key.
insert into public.stripe_events (id, type) values ('evt_1', 'checkout.session.completed');
select throws_ok(
  $$insert into public.stripe_events (id, type) values ('evt_1', 'checkout.session.completed')$$,
  '23505', null,
  'a repeated event id is rejected'
);

select * from finish();
rollback;
