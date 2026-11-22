-- The diagrams drawn into a playbook: one practice script per book, saved on every edit.
-- `script` is the app's DiagramScript JSON (plays, each a diagram on 0..1 coordinates).
-- `version` counts saves so two coaches editing at once cannot silently overwrite each other:
-- the client updates `where version = <the one it loaded>` and treats zero rows as a conflict.
begin;

create table public.playbook_scripts (
  playbook_id uuid primary key references public.playbooks on delete cascade,
  script jsonb not null,
  version integer not null default 1,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.playbook_scripts enable row level security;

-- A save bumps the version and stamps who and when, whatever the client sent.
create function app.touch_playbook_script()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger playbook_scripts_touch
  before insert or update on public.playbook_scripts
  for each row execute function app.touch_playbook_script();

-- Staff of the book's team can read it. Writing follows the book's side, like filing plays.
create policy ps_select on public.playbook_scripts
  for select to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_scripts.playbook_id
        and app.is_staff(book.team_id)
    )
  );

create policy ps_write on public.playbook_scripts
  for all to authenticated
  using (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_scripts.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks book
      where book.id = playbook_scripts.playbook_id
        and app.is_staff(book.team_id)
        and app.can_edit_side(book.team_id, app.book_side(book.id))
    )
  );

grant select, insert, update, delete on table public.playbook_scripts to authenticated;

commit;
