-- Rollback for 20261130000000_activity.sql: drops player activity and its functions.

begin;

drop trigger if exists memberships_clear_activity on public.memberships;
drop function if exists app.clear_member_activity();
drop function if exists public.assignment_progress(uuid);
drop function if exists public.activity_summary(uuid, date, date);
drop function if exists public.record_activity(uuid, uuid, date, text, text, int, int, int);
drop table if exists public.activity_daily;

commit;
