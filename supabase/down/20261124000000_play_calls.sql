-- Rollback for 20261124000000_play_calls.sql. Adjustment, Recognize and React answers
-- are dropped, and every play is visible to assigned players again whether or not it
-- was published.

begin;

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
        or exists (
          select 1
          from public.playbook_plays pp
          join public.playbooks pb on pb.id = pp.playbook_id and pb.team_id = pl.team_id
          where pp.play_id = p
            and app.assigned_book(pb.id)
        )
      )
  )
$$;

drop trigger position_rules_guard_published on public.position_rules;
drop trigger position_rules_stamp on public.position_rules;
create trigger position_rules_stamp
  before insert or update on public.position_rules
  for each row execute function app.stamp_position_rule();
drop function app.guard_published_rules();
drop trigger plays_recheck_published on public.plays;
drop function app.recheck_published_play();
drop function public.unpublish_play(uuid);
drop function public.publish_play(uuid);
drop function app.play_is_complete(uuid);
drop function app.play_rule_gaps(uuid, int, text);

alter table public.plays drop column published_by, drop column published_at;
alter table public.position_rules
  drop column react,
  drop column recognize,
  drop column adjustment;

commit;
