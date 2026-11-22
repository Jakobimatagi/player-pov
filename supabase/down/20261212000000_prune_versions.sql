-- Rollback for 20261212000000_prune_versions.sql: versions stop being pruned. Versions
-- already deleted are not restored; take them from a backup if ever needed.

begin;

drop trigger if exists scout_look_versions_prune on public.scout_look_versions;
drop trigger if exists play_versions_prune on public.play_versions;
drop function if exists app.prune_look_versions();
drop function if exists app.prune_play_versions();

commit;
