-- Rolls back supabase/migrations/20261105000000_playbook_folders.sql.
-- Not a migration: supabase db push does not apply this file.
-- Subfolders become top-level playbooks; nothing is deleted.

begin;

revoke update (parent_id, kind) on table public.playbooks from authenticated;

drop policy if exists pb_select on public.playbooks;
create policy pb_select on public.playbooks
  for select to authenticated
  using (
    app.is_staff(team_id)
    or (
      archived_at is null
      and exists (
        select 1
        from public.assignment_targets at
        where at.playbook_id = playbooks.id
          and at.user_id = auth.uid()
      )
    )
  );

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
          from public.assignment_targets at
          join public.playbook_plays pp on pp.playbook_id = at.playbook_id
          join public.playbooks pb on pb.id = at.playbook_id and pb.archived_at is null
          where at.user_id = auth.uid()
            and pp.play_id = p
            and at.team_id = pl.team_id
        )
      )
  )
$$;

drop function if exists app.assigned_book(uuid);
drop trigger if exists playbooks_parent_guard on public.playbooks;
drop function if exists app.guard_playbook_parent();
drop index if exists public.playbooks_parent_idx;
alter table public.playbooks drop column if exists kind;
alter table public.playbooks drop column if exists parent_id;

commit;
