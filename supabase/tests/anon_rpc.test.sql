begin;
select plan(1);
set local search_path = public, extensions;

select is_empty(
  $$
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1
  $$,
  'no security definer function in public is executable by anon'
);

select * from finish();
rollback;
