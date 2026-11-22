-- Keep only recent play and look versions.
-- Rollback (not applied by supabase db push): supabase/down/20261212000000_prune_versions.sql
--
-- Every save writes a whole new play version (source and compiled, about 8 KB stored) and a
-- new look version, and nothing removed old ones, so saved history was nearly all of the
-- database (97% in a 100-team load test). Nothing reads an old version: every reader asks
-- for plays.current_version or scout_looks.current_version.
--
-- 1. After each new version, versions more than 4 behind it are deleted, so each play and
--    look keeps its current version plus the 4 before it.
-- 2. The same rule runs once now over existing rows.
-- The current version is never deleted, even if current_version points somewhere older.

begin;

create function app.prune_play_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.play_versions pv
  where pv.play_id = new.play_id
    and pv.version <= new.version - 5
    and pv.version is distinct from (select current_version from public.plays where id = new.play_id);
  return null;
end;
$$;

create function app.prune_look_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.scout_look_versions lv
  where lv.look_id = new.look_id
    and lv.version <= new.version - 5
    and lv.version is distinct from (select current_version from public.scout_looks where id = new.look_id);
  return null;
end;
$$;

create trigger play_versions_prune
  after insert on public.play_versions
  for each row execute function app.prune_play_versions();

create trigger scout_look_versions_prune
  after insert on public.scout_look_versions
  for each row execute function app.prune_look_versions();

revoke all on function app.prune_play_versions() from public, anon, authenticated;
revoke all on function app.prune_look_versions() from public, anon, authenticated;

-- One pass over what is already stored.
delete from public.play_versions pv
using (select play_id, max(version) as latest from public.play_versions group by play_id) m
where pv.play_id = m.play_id
  and pv.version <= m.latest - 5
  and pv.version is distinct from (select current_version from public.plays where id = pv.play_id);

delete from public.scout_look_versions lv
using (select look_id, max(version) as latest from public.scout_look_versions group by look_id) m
where lv.look_id = m.look_id
  and lv.version <= m.latest - 5
  and lv.version is distinct from (select current_version from public.scout_looks where id = lv.look_id);

commit;
