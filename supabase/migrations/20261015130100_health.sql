-- Cheap keep-alive target. GET /rest/v1/rpc/health with the anon key.
create function public.health()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 1
$$;

revoke all on function public.health() from public;
grant execute on function public.health() to anon, authenticated, service_role;
