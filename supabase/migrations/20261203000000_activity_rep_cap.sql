-- Cap the reps a player can record on one play in one day.
-- Rollback (not applied by supabase db push): supabase/down/20261203000000_activity_rep_cap.sql
--
-- record_activity already capped each call at 5 runs, but nothing stopped a player calling
-- it over and over from the console, and completed reps are the dashboard's headline
-- number. Now the day's totals for (team, player, day, play) are capped across every kind
-- and slot: 20 completed runs and 40 started runs. Watching as a different slot or camera
-- does not open a fresh allowance. Anything over the cap is dropped quietly rather than
-- raising, so a real player who goes past it loses nothing they need and the client does
-- not retry.

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
  day_started int;
  day_completed int;
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

  -- The day's runs on this play so far, across every kind and slot.
  if v_started > 0 or v_completed > 0 then
    select coalesce(sum(a.runs_started), 0), coalesce(sum(a.runs_completed), 0)
      into day_started, day_completed
    from public.activity_daily a
    where a.team_id = p_team and a.user_id = uid and a.day = p_day and a.play_id = p_play;
    v_started := least(v_started, greatest(40 - day_started, 0));
    v_completed := least(v_completed, greatest(20 - day_completed, 0));
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
