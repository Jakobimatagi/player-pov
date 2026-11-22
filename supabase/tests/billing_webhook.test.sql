begin;
select plan(19);
set local search_path = public, extensions, auth;

-- Team A: 11 head coach, no billing account yet.
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

-- One webhook call for team A's account, with the event time as an offset in minutes.
create function pg_temp.apply(event text, minutes int, status text, blocks int default 0,
                              account uuid default null, sub text default 'sub_1')
returns text
language sql
as $$
  select public.billing_apply_subscription(
    event, 'customer.subscription.updated', '2026-11-01 12:00+00'::timestamptz + make_interval(mins => minutes),
    account, 'cus_1', sub, 'team', status, '2027-11-01 12:00+00', blocks
  )
$$;

select pg_temp.make_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'hc@example.com');
insert into public.teams (id, name, season_ends_on, created_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
insert into public.memberships (team_id, user_id, role) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach');

-- 1. The account a checkout starts from.
select set_config('test.account', (
  select (public.billing_account_for_team(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')).id::text
), true);
select is(
  (select billing_account_id::text from public.teams where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
  current_setting('test.account'),
  'a team with no account gets one, linked to it'
);
select is(
  (public.billing_account_for_team(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')).id::text,
  current_setting('test.account'),
  'asking again returns the same account'
);

-- 2. Events.
select is(
  pg_temp.apply('evt_0', 0, 'active', 0, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee99', 'sub_other'),
  'unknown_account',
  'an event for an account we do not know is recorded and skipped'
);

select is(pg_temp.apply('evt_1', 10, 'active', 0, current_setting('test.account')::uuid), 'applied',
          'a new subscription is applied');
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'team', 'the team is on Team');
select is((select film_quota_bytes from public.teams where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
          10737418240::bigint, 'Team gets 10 GiB of film');
select is((select stripe_customer_id from public.billing_accounts where id = current_setting('test.account')::uuid), 'cus_1', 'the Stripe customer is stored');

select is(pg_temp.apply('evt_1', 10, 'canceled'), 'duplicate', 'a repeated event id is a no-op');
select is(pg_temp.apply('evt_old', 5, 'canceled'), 'stale', 'an event older than the last one is skipped');
select is((select status from public.billing_accounts where id = current_setting('test.account')::uuid), 'active', 'a stale event changes nothing');

-- With no account id in the metadata, the subscription id finds it.
select is(pg_temp.apply('evt_2', 20, 'past_due'), 'applied', 'the subscription id finds the account');
select is((select past_due_since from public.billing_accounts where id = current_setting('test.account')::uuid), '2026-11-01 12:20+00'::timestamptz,
          'going past_due starts the grace clock');
select pg_temp.apply('evt_3', 30, 'past_due');
select is((select past_due_since from public.billing_accounts where id = current_setting('test.account')::uuid), '2026-11-01 12:20+00'::timestamptz,
          'a later past_due event keeps the first time');

select pg_temp.apply('evt_4', 40, 'active', 2);
select is((select past_due_since from public.billing_accounts where id = current_setting('test.account')::uuid), null::timestamptz,
          'paying again clears the grace clock');
select is((select film_quota_bytes from public.teams where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
          (10737418240 + 2 * 53687091200)::bigint, 'two film add-ons add 100 GiB');

select pg_temp.apply('evt_5', 50, 'canceled', 2);
select is(app.plan_of('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'), 'starter', 'a canceled plan drops to Starter');
select is((select film_quota_bytes from public.teams where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'),
          0::bigint, 'Starter gets no new film');

-- 3. Clients cannot call either.
set local role authenticated;
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select throws_ok(
  $$select public.billing_account_for_team('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11')$$,
  '42501', null,
  'the head coach cannot create billing accounts directly'
);
select throws_ok(
  $$select pg_temp.apply('evt_9', 90, 'active', 0, current_setting('test.account')::uuid)$$,
  '42501', null,
  'the head coach cannot apply a subscription'
);
reset role;

select * from finish();
rollback;
