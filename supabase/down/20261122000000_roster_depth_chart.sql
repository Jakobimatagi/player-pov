-- Rollback for 20261122000000_roster_depth_chart.sql.

begin;

drop function if exists public.set_depth(uuid, text, uuid[]);
drop function if exists public.merge_roster_players(uuid, uuid);
drop table if exists public.depth_chart;
drop trigger if exists memberships_roster_sync on public.memberships;
drop table if exists public.roster_players;
drop function if exists app.sync_roster_from_membership();
drop function if exists app.sync_membership_from_roster();
drop function if exists app.guard_roster_player();
drop function if exists app.depth_slot_side(text);

commit;
