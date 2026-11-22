begin;
select plan(9);
set local search_path = public, extensions, auth;

-- Team A on an active Team subscription: 11 head coach, 12 coach, 13 player.
-- Team B: 21 head coach.
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
end $$;

insert into public.billing_accounts (id, stripe_customer_id, plan, status, current_period_end) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'cus_A', 'team', 'active', '2027-11-22 12:00+00');
insert into public.teams (id, name, season_ends_on, created_by, billing_account_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Team A', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Team B', '2026-12-31', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', null);
insert into public.memberships (team_id, user_id, role, position) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'head_coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'coach', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13', 'player', 'QB'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'head_coach', null);
insert into public.plays (team_id, name, side) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Mesh', 'offense'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Smash', 'offense');
insert into public.plays (team_id, name, side, archived_at) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Old', 'offense', now());

set local role authenticated;

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11');
select results_eq(
  $$select plan, coaches, players, plays, film_used, film_quota
    from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values ('team'::text, 2, 1, 2, 0::bigint, 10737418240::bigint)$$,
  'the head coach sees the plan and usage, counting only live plays'
);
select results_eq(
  $$select is_head_coach, status, renews_at, has_customer
    from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values (true, 'active'::text, '2027-11-22 12:00+00'::timestamptz, true)$$,
  'the head coach sees status, renewal and the Stripe customer'
);
select is_empty(
  $$select 1 from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02')$$,
  'nothing for another team'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12');
select results_eq(
  $$select plan, max_players, is_head_coach from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values ('team'::text, null::int, false)$$,
  'an assistant coach sees the plan and limits'
);
select results_eq(
  $$select status, renews_at, past_due_since, has_customer
    from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  $$values (null::text, null::timestamptz, null::timestamptz, null::boolean)$$,
  'an assistant coach does not see payment details'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13');
select is_empty(
  $$select 1 from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  'a player sees no billing'
);

select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21');
select results_eq(
  $$select plan, max_plays, max_players, max_coaches, features
    from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02')$$,
  $$values ('starter'::text, 15, 25, 1, array[]::text[])$$,
  'a team with no account shows Starter limits'
);
select results_eq(
  $$select status, has_customer from public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02')$$,
  $$values (null::text, false)$$,
  'no account means no status and no customer'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.team_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')$$,
  '42501', null,
  'signed-out callers cannot ask'
);
reset role;

select * from finish();
rollback;
