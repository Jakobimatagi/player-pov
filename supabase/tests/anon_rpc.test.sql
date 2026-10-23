begin;
select plan(27);
set local search_path = public, extensions;

-- Supabase internals stay out of this check. public and app are in it,
-- including every security definer function in app.
select is_empty(
  $$
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in (
      'pg_catalog',
      'information_schema',
      'pg_toast',
      'auth',
      'storage',
      'extensions',
      'graphql',
      'graphql_public',
      'realtime',
      'vault',
      'net',
      'supabase_functions',
      'pgsodium',
      'pgsodium_masks'
    )
      and n.nspname not like 'pg\_%'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1
  $$,
  'no security definer function outside system schemas is executable by anon'
);

select ok(
  has_function_privilege('authenticated', 'public.create_team(text, text, text, text, date)', 'EXECUTE'),
  'authenticated can execute create_team'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_player_invite(uuid, text, text, public.team_role, public.position_code, boolean, text)',
    'EXECUTE'
  ),
  'authenticated can execute create_player_invite'
);
select ok(
  has_function_privilege('authenticated', 'public.accept_invite(uuid)', 'EXECUTE'),
  'authenticated can execute accept_invite(uuid)'
);
select ok(
  has_function_privilege('authenticated', 'public.delete_member_data(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute delete_member_data'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_member(uuid, uuid, public.team_role, public.position_code)',
    'EXECUTE'
  ),
  'authenticated can execute update_member'
);
select ok(
  has_function_privilege('authenticated', 'public.remove_member(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute remove_member'
);
select ok(
  has_function_privilege('authenticated', 'public.revoke_invite(uuid)', 'EXECUTE'),
  'authenticated can execute revoke_invite'
);
select ok(
  has_function_privilege('authenticated', 'public.resend_invite(uuid)', 'EXECUTE'),
  'authenticated can execute resend_invite'
);
select ok(
  has_function_privilege('authenticated', 'public.invite_status(uuid)', 'EXECUTE'),
  'authenticated can execute invite_status'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.save_play_version(uuid, uuid, integer, text, jsonb, jsonb, text, text, uuid, integer, jsonb, text)',
    'EXECUTE'
  ),
  'anon cannot execute save_play_version'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_play_version(uuid, uuid, integer, text, jsonb, jsonb, text, text, uuid, integer, jsonb, text)',
    'EXECUTE'
  ),
  'authenticated can execute save_play_version'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.save_play_version(uuid, uuid, integer, text, jsonb, jsonb, text, text, uuid, integer, jsonb, text)',
    'EXECUTE'
  ),
  'service_role cannot execute save_play_version'
);
select ok(
  not has_function_privilege('anon', 'app.can_view_play(uuid)', 'EXECUTE'),
  'anon cannot execute can_view_play'
);
select ok(
  has_function_privilege('authenticated', 'app.can_view_play(uuid)', 'EXECUTE'),
  'authenticated can execute can_view_play'
);
select ok(
  has_function_privilege('service_role', 'app.can_view_play(uuid)', 'EXECUTE'),
  'service_role can execute can_view_play'
);
select ok(
  not has_function_privilege('anon', 'app.guard_assignment()', 'EXECUTE'),
  'anon cannot execute guard_assignment'
);
select ok(
  not has_function_privilege('authenticated', 'app.guard_assignment()', 'EXECUTE'),
  'authenticated cannot execute guard_assignment'
);
select ok(
  has_function_privilege('service_role', 'app.guard_assignment()', 'EXECUTE'),
  'service_role can execute guard_assignment'
);
select ok(
  not has_function_privilege('anon', 'app.guard_playbook_play()', 'EXECUTE'),
  'anon cannot execute guard_playbook_play'
);
select ok(
  not has_function_privilege('authenticated', 'app.guard_playbook_play()', 'EXECUTE'),
  'authenticated cannot execute guard_playbook_play'
);
select ok(
  has_function_privilege('service_role', 'app.guard_playbook_play()', 'EXECUTE'),
  'service_role can execute guard_playbook_play'
);
select ok(
  not has_function_privilege('anon', 'app.guard_package_look()', 'EXECUTE'),
  'anon cannot execute guard_package_look'
);
select ok(
  not has_function_privilege('authenticated', 'app.guard_package_look()', 'EXECUTE'),
  'authenticated cannot execute guard_package_look'
);
select ok(
  not has_function_privilege('service_role', 'app.guard_package_look()', 'EXECUTE'),
  'service_role cannot execute guard_package_look'
);

set local role anon;
select throws_ok(
  $$select public.invite_status(gen_random_uuid())$$,
  '42501',
  'permission denied for function invite_status',
  'anon cannot call invite_status'
);
reset role;

-- Default privileges for postgres no longer grant execute to anon.
create function public.anon_exec_probe()
returns integer
language sql
as $$ select 1 $$;

set local role anon;
select throws_ok(
  $$select public.anon_exec_probe()$$,
  '42501',
  'permission denied for function anon_exec_probe',
  'anon cannot execute a new public function'
);
reset role;
drop function public.anon_exec_probe();

select * from finish();
rollback;
