-- Play calls: the 3 A's and 3 R's, and Draft / Published plays.
-- Rollback (not applied by supabase db push): supabase/down/20261124000000_play_calls.sql
--
-- Every position on a play's own side (plays.side) owes six answers before players can
-- see the play:
--   Pre-snap   Alignment, Assignment, Adjustment
--   Post-snap  Read (key_read), Recognize, React
-- Coaching points (notes) stay optional, and so do the scout-look players.
--
-- A play starts as a Draft. publish_play refuses while any position is missing an answer.
-- A published play can't lose an answer (unpublish first), and saving a new version
-- that leaves a position unanswered puts the play back to Draft. Players read only
-- published plays; staff read everything, as before.

begin;

-- 1. Three more answers per position.
alter table public.position_rules
  add column adjustment text check (length(adjustment) <= 500),
  add column recognize text check (length(recognize) <= 280),
  add column react text check (length(react) <= 500);

grant update (adjustment, recognize, react) on table public.position_rules to authenticated;

-- 2. Draft / Published.
alter table public.plays
  add column published_at timestamptz,
  add column published_by uuid references auth.users on delete set null;

-- Our-side slots still missing an answer, with what each one is missing. Empty when
-- the play is complete. Reads version `v`, or the play's current version when v is null.
create function app.play_rule_gaps(p uuid, v int default null)
returns table (slot text, missing text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    pj ->> 'id',
    array_remove(array[
      case when coalesce(btrim(r.alignment), '') = '' then 'alignment' end,
      case when coalesce(btrim(r.assignment), '') = '' then 'assignment' end,
      case when coalesce(btrim(r.adjustment), '') = '' then 'adjustment' end,
      case when coalesce(btrim(r.key_read), '') = '' then 'read' end,
      case when coalesce(btrim(r.recognize), '') = '' then 'recognize' end,
      case when coalesce(btrim(r.react), '') = '' then 'react' end
    ], null)
  from public.plays pl
  join public.play_versions pv
    on pv.play_id = pl.id and pv.version = coalesce(v, pl.current_version)
  cross join lateral jsonb_array_elements(coalesce(pv.compiled -> 'players', '[]'::jsonb)) pj
  left join public.position_rules r on r.play_id = pl.id and r.slot = pj ->> 'id'
  where pl.id = p
    and pj ->> 'team' = pl.side
    and (
      r.slot is null
      or coalesce(btrim(r.alignment), '') = ''
      or coalesce(btrim(r.assignment), '') = ''
      or coalesce(btrim(r.adjustment), '') = ''
      or coalesce(btrim(r.key_read), '') = ''
      or coalesce(btrim(r.recognize), '') = ''
      or coalesce(btrim(r.react), '') = ''
    )
$$;

create function app.play_is_complete(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plays where id = p and current_version is not null
  ) and not exists (select 1 from app.play_rule_gaps(p))
$$;

revoke all on function app.play_rule_gaps(uuid, int) from public, anon, authenticated;
revoke all on function app.play_is_complete(uuid) from public, anon, authenticated;
grant execute on function app.play_rule_gaps(uuid, int) to service_role;
grant execute on function app.play_is_complete(uuid) to service_role;

-- Publish: the head coach, or the coordinator of the play's side, once every answer is in.
create function public.publish_play(p_play uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_side text;
  v_archived timestamptz;
  v_gaps int;
  v_at timestamptz;
begin
  select team_id, side, archived_at into v_team, v_side, v_archived
  from public.plays where id = p_play;
  if v_team is null or not app.is_staff(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.can_edit_side(v_team, v_side) then
    raise exception 'only the head coach or the % coordinator can publish this play', v_side
      using errcode = '42501';
  end if;
  if v_archived is not null then
    raise exception 'play is archived' using errcode = '22023';
  end if;
  select count(*) into v_gaps from app.play_rule_gaps(p_play);
  if v_gaps > 0 or not app.play_is_complete(p_play) then
    raise exception 'play is incomplete: % position(s) still need all 3 A''s and 3 R''s', v_gaps
      using errcode = '23514';
  end if;
  update public.plays
  set published_at = coalesce(published_at, pg_catalog.now()),
      published_by = coalesce(published_by, auth.uid())
  where id = p_play
  returning published_at into v_at;
  return v_at;
end;
$$;

create function public.unpublish_play(p_play uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_side text;
begin
  select team_id, side into v_team, v_side from public.plays where id = p_play;
  if v_team is null or not app.is_staff(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.can_edit_side(v_team, v_side) then
    raise exception 'only the head coach or the % coordinator can unpublish this play', v_side
      using errcode = '42501';
  end if;
  update public.plays set published_at = null, published_by = null where id = p_play;
end;
$$;

revoke all on function public.publish_play(uuid) from public, anon;
revoke all on function public.unpublish_play(uuid) from public, anon;
grant execute on function public.publish_play(uuid) to authenticated;
grant execute on function public.unpublish_play(uuid) to authenticated;

-- A new version that leaves a position unanswered sends the play back to Draft.
create function app.recheck_published_play()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published_at is not null
     and new.current_version is distinct from old.current_version
     and exists (select 1 from app.play_rule_gaps(new.id, new.current_version)) then
    new.published_at := null;
    new.published_by := null;
  end if;
  return new;
end;
$$;

create trigger plays_recheck_published
  before update of current_version on public.plays
  for each row execute function app.recheck_published_play();

revoke all on function app.recheck_published_play() from public, anon, authenticated, service_role;

-- A published play keeps every answer. Clearing one means unpublishing first, so
-- players never see a position with a blank.
create function app.guard_published_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_play uuid := coalesce(old.play_id, new.play_id);
begin
  if exists (
    select 1 from public.plays
    where id = v_play and published_at is not null and archived_at is null
  ) and exists (select 1 from app.play_rule_gaps(v_play)) then
    raise exception 'this play is published, so every position needs all 3 A''s and 3 R''s. Unpublish it to clear an answer'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create trigger position_rules_guard_published
  after update or delete on public.position_rules
  for each row execute function app.guard_published_rules();

revoke all on function app.guard_published_rules() from public, anon, authenticated, service_role;

-- 3. Players read published plays only.
create or replace function app.can_view_play(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plays pl
    where pl.id = p
      and pl.archived_at is null
      and (
        app.is_staff(pl.team_id)
        or (
          pl.published_at is not null
          and exists (
            select 1
            from public.playbook_plays pp
            join public.playbooks pb on pb.id = pp.playbook_id and pb.team_id = pl.team_id
            where pp.play_id = p
              and app.assigned_book(pb.id)
          )
        )
      )
  )
$$;

commit;
