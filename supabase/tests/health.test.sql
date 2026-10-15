begin;
select plan(2);
set local search_path = public, extensions;

select has_function('public', 'health', 'health exists');

set local role anon;
select is(public.health(), 1, 'anon can call health');

select * from finish();
rollback;
