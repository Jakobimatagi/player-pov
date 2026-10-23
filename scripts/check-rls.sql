-- Fail when any ordinary public table has row level security off.
do $$
declare
  missing text;
  n int;
begin
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r';

  if n = 0 then
    raise exception 'no public tables found';
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into missing
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS disabled on: %', missing;
  end if;

  -- roster_public is security_invoker=false on purpose. Every other public
  -- view must run as the caller so it cannot leak across teams.
  select string_agg(c.relname, ', ' order by c.relname) into missing
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'v'
    and c.relname <> 'roster_public'
    and not exists (
      select 1
      from unnest(coalesce(c.reloptions, array[]::text[])) as opt
      where opt = 'security_invoker=true'
    );

  if missing is not null then
    raise exception 'view is not security_invoker: %', missing;
  end if;
end $$;
