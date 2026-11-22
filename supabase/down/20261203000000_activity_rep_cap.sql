-- Rollback for 20261203000000_activity_rep_cap.sql: restores record_activity without the
-- daily rep cap (the per-call caps from 20261130000000_activity.sql stay).

begin;

create or replace function public.record_activity(
  p_team uuid,
  p_play uuid,
  p_day date,
  p_kind text,
  p_slot text,
  p_seconds int,
  p_runs_started int default 0,
  p_runs_completed int default 0
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  play_team uuid;
  v_slot text := coalesce(p_slot, '');
  v_seconds int := least(coalesce(p_seconds, 0), 120);
  v_started int := least(coalesce(p_runs_started, 0), 5);
  v_completed int := least(coalesce(p_runs_completed, 0), 5);
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if app.my_role(p_team) is distinct from 'player'::public.team_role then
    raise exception 'only players on this team record activity' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('playbook', 'pov', 'broadcast', 'topdown') then
    raise exception 'unknown activity kind' using errcode = '22023';
  end if;
  if v_seconds < 0 or v_started < 0 or v_completed < 0 then
    raise exception 'activity cannot be negative' using errcode = '22023';
  end if;
  if length(v_slot) > 40 or (p_kind <> 'pov' and v_slot <> '') then
    raise exception 'slot is only recorded for POV' using errcode = '22023';
  end if;
  if p_kind = 'playbook' and (v_started > 0 or v_completed > 0) then
    raise exception 'runs are only recorded in the viewer' using errcode = '22023';
  end if;
  if p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'activity day must be today' using errcode = '22023';
  end if;
  select team_id into play_team from public.plays where id = p_play;
  if play_team is null or play_team is distinct from p_team or not app.can_view_play(p_play) then
    raise exception 'play is not on this team' using errcode = '42501';
  end if;
  if v_seconds = 0 and v_started = 0 and v_completed = 0 then
    return;
  end if;
  insert into public.activity_daily as a (
    team_id, user_id, day, play_id, kind, slot, seconds, runs_started, runs_completed
  ) values (
    p_team, uid, p_day, p_play, p_kind, v_slot, v_seconds, v_started, v_completed
  )
  on conflict (team_id, user_id, day, play_id, kind, slot) do update
    set seconds = least(a.seconds + excluded.seconds, 86400),
        runs_started = a.runs_started + excluded.runs_started,
        runs_completed = a.runs_completed + excluded.runs_completed,
        updated_at = pg_catalog.now();
end;
$$;

commit;
