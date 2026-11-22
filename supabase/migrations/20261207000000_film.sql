-- Game film and the plays marked on it (issue #59, step 1: data, RLS, storage).
-- Rollback (not applied by supabase db push): supabase/down/20261207000000_film.sql
--
-- 1. film: one row per uploaded game. The video lives in the private `film` storage
--    bucket, once per game, at <team_id>/<film_id>/original. A transcode worker (service
--    role) writes the streaming proxy (<team_id>/<film_id>/proxy.mp4, 720p faststart) and
--    thumbnails (<team_id>/<film_id>/thumbs/...), then sets proxy_key, duration_ms and
--    status = ready. Coaches stream the proxy, never the original.
-- 2. film_clips: a marked play is a start and end time on that one file, plus breakdown
--    tags. Nothing is cut or stored per play. A clip can link to the play or scout look
--    a coach charted from it.
-- 3. Who sees what:
--    - Staff read every film and clip on their team. Any coach tags clips (position
--      coaches break film down). Adding, renaming or deleting a film needs edit rights on
--      the folder it sits in (app.can_edit_book), or any staff when it has no folder.
--    - A player reads a clip only when the play it produced is assigned to them
--      (app.can_view_play), and reads that film's row and its proxy and thumbnails so the
--      clip can play. Never the original, never the film library, never another team.
--    - Status, proxy_key and duration_ms are the worker's. A coach only moves a film from
--      uploading to processing once their upload finishes.
-- 4. Limits: one file is at most 20 GiB (bucket limit and film.size_bytes). A team holds
--    at most teams.film_quota_bytes of film (200 GiB by default), counted from the
--    declared size_bytes of its film rows.

begin;

-- Clips link to plays on the same team only.
alter table public.plays add constraint plays_team_id_id_key unique (team_id, id);

alter table public.teams
  add column film_quota_bytes bigint not null default 214748364800
  check (film_quota_bytes >= 0);

-- 1. Film.
create table public.film (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  -- Usually a scout pack week folder. Null for film not filed in a folder yet.
  folder_id uuid references public.playbooks on delete set null,
  title text not null check (length(btrim(title)) between 1 and 120),
  opponent text check (opponent is null or length(btrim(opponent)) between 1 and 80),
  game_date date,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 21474836480),
  -- Set by the database: <team_id>/<film_id>/original.
  storage_key text not null,
  proxy_key text,
  duration_ms int check (duration_ms is null or duration_ms > 0),
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id),
  unique (storage_key),
  unique (proxy_key),
  check (status <> 'ready' or (proxy_key is not null and duration_ms is not null))
);

create index film_team_idx on public.film (team_id, created_at desc);
create index film_folder_idx on public.film (folder_id) where folder_id is not null;

-- 2. Clips.
create table public.film_clips (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  film_id uuid not null,
  play_number int check (play_number is null or play_number between 1 and 999),
  start_ms int not null check (start_ms >= 0),
  end_ms int not null,
  side text check (side is null or side in ('offense', 'defense', 'special', 'kick')),
  quarter smallint check (quarter is null or quarter between 1 and 5),
  down smallint check (down is null or down between 1 and 4),
  distance smallint check (distance is null or distance between 0 and 99),
  hash text check (hash is null or hash in ('L', 'M', 'R')),
  -- Negative is the offense's own side of the field, positive the opponent's, 50 midfield.
  yard_line smallint check (yard_line is null or yard_line between -49 and 50),
  personnel text check (personnel is null or length(personnel) <= 40),
  formation text check (formation is null or length(formation) <= 40),
  front text check (front is null or length(front) <= 40),
  coverage text check (coverage is null or length(coverage) <= 40),
  result text check (result is null or length(result) <= 40),
  gain_loss smallint check (gain_loss is null or gain_loss between -99 and 99),
  play_id uuid,
  look_id uuid,
  -- New breakdown columns without a migration. A flat object, at most 4 KB.
  tags jsonb not null default '{}'::jsonb
    check (jsonb_typeof(tags) = 'object' and octet_length(tags::text) <= 4096),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_ms > start_ms and end_ms - start_ms <= 600000),
  foreign key (team_id, film_id) references public.film (team_id, id) on delete cascade,
  foreign key (team_id, play_id)
    references public.plays (team_id, id) on delete set null (play_id),
  foreign key (team_id, look_id)
    references public.scout_looks (team_id, id) on delete set null (look_id)
);

create index film_clips_film_idx on public.film_clips (film_id, start_ms);
create index film_clips_play_idx on public.film_clips (play_id) where play_id is not null;

-- 3. Access helpers.

-- Add, rename, refile or delete a film: staff with edit rights on its folder, or any
-- staff when it has no folder.
create function app.can_write_film(t uuid, f uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_staff(t) and (f is null or app.can_edit_book(f))
$$;

-- Staff on the film's team, or a player with an assigned play charted from one of its clips.
create function app.can_view_film(f uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.film fm
    where fm.id = f
      and (
        app.is_staff(fm.team_id)
        or exists (
          select 1
          from public.film_clips c
          where c.film_id = fm.id
            and c.team_id = fm.team_id
            and c.play_id is not null
            and app.can_view_play(c.play_id)
        )
      )
  )
$$;

-- Object keys are <team_id>/<film_id>/<file>. Returns the film row the key belongs to,
-- or nothing for a malformed key or a team that does not match.
create function app.film_of_object(obj text)
returns public.film
language sql
stable
security definer
set search_path = ''
as $$
  select fm.*
  from public.film fm
  where split_part(obj, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(obj, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and fm.id = split_part(obj, '/', 2)::uuid
    and fm.team_id = split_part(obj, '/', 1)::uuid
$$;

-- Staff read every file of their team's film. A player reads only the proxy and the
-- thumbnails of a film they can view, never the original.
create function app.can_read_film_object(obj text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select app.is_staff(fm.team_id)
      or (
        (obj = fm.proxy_key or obj like fm.team_id || '/' || fm.id || '/thumbs/%')
        and app.can_view_film(fm.id)
      )
    from app.film_of_object(obj) fm
    where fm.id is not null
  ), false)
$$;

-- The uploader writes the original once, while the film is still uploading. Proxy and
-- thumbnails are the worker's (service role, which skips these policies).
create function app.can_upload_film_object(obj text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select fm.status = 'uploading'
      and obj = fm.storage_key
      and app.can_write_film(fm.team_id, fm.folder_id)
    from app.film_of_object(obj) fm
    where fm.id is not null
  ), false)
$$;

create function app.can_delete_film_object(obj text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select app.can_write_film(fm.team_id, fm.folder_id)
    from app.film_of_object(obj) fm
    where fm.id is not null
  ), false)
$$;

revoke all on function app.can_write_film(uuid, uuid) from public, anon;
revoke all on function app.can_view_film(uuid) from public, anon;
revoke all on function app.film_of_object(text) from public, anon, authenticated;
revoke all on function app.can_read_film_object(text) from public, anon;
revoke all on function app.can_upload_film_object(text) from public, anon;
revoke all on function app.can_delete_film_object(text) from public, anon;
grant execute on function app.can_write_film(uuid, uuid) to authenticated, service_role;
grant execute on function app.can_view_film(uuid) to authenticated, service_role;
grant execute on function app.film_of_object(text) to service_role;
grant execute on function app.can_read_film_object(text) to authenticated, service_role;
grant execute on function app.can_upload_film_object(text) to authenticated, service_role;
grant execute on function app.can_delete_film_object(text) to authenticated, service_role;

-- 4. Guards.

-- Same-team folder, server-set keys, size and team quota on insert, and the worker-only
-- columns. auth.uid() is null for the worker (service role) and for migrations.
create function app.guard_film()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  folder_team uuid;
  quota bigint;
  used bigint;
begin
  if new.folder_id is not null then
    select team_id into folder_team from public.playbooks where id = new.folder_id;
    if folder_team is distinct from new.team_id then
      raise exception 'folder is not on this team' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.storage_key := new.team_id || '/' || new.id || '/original';
    if uid is not null then
      new.created_by := uid;
      new.status := 'uploading';
      new.proxy_key := null;
      new.duration_ms := null;
    end if;
    -- Serialize uploads per team so two at once cannot both slip under the quota.
    select film_quota_bytes into quota from public.teams where id = new.team_id for update;
    select coalesce(sum(size_bytes), 0) into used from public.film where team_id = new.team_id;
    if used + new.size_bytes > quota then
      raise exception 'team film storage is full (% of % bytes used)', used, quota
        using errcode = '53400';
    end if;
  else
    if new.id is distinct from old.id
       or new.team_id is distinct from old.team_id
       or new.storage_key is distinct from old.storage_key
       or new.size_bytes is distinct from old.size_bytes
       or new.created_by is distinct from old.created_by then
      raise exception 'team, file and uploader cannot change' using errcode = '42501';
    end if;
    if uid is not null then
      if new.proxy_key is distinct from old.proxy_key
         or new.duration_ms is distinct from old.duration_ms then
        raise exception 'only the video worker sets the proxy and duration'
          using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         and not (old.status = 'uploading' and new.status = 'processing') then
        raise exception 'a coach only marks an upload as finished' using errcode = '42501';
      end if;
    end if;
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

create trigger film_guard
  before insert or update on public.film
  for each row execute function app.guard_film();

revoke all on function app.guard_film() from public, anon, authenticated;

-- A clip stays on its film and team, ends inside the film once its length is known, and a
-- film holds at most 500 clips.
create function app.guard_film_clip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  film_length int;
begin
  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id
       or new.film_id is distinct from old.film_id
       or new.created_by is distinct from old.created_by then
      raise exception 'a clip stays on its film' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.now();
  else
    if uid is not null then
      new.created_by := uid;
    end if;
    if (select count(*) from public.film_clips where film_id = new.film_id) >= 500 then
      raise exception 'a film holds at most 500 clips' using errcode = '53400';
    end if;
  end if;

  select duration_ms into film_length from public.film where id = new.film_id;
  if film_length is not null and new.end_ms > film_length then
    raise exception 'clip ends after the film does' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger film_clips_guard
  before insert or update on public.film_clips
  for each row execute function app.guard_film_clip();

revoke all on function app.guard_film_clip() from public, anon, authenticated;

-- 5. RLS.
alter table public.film enable row level security;
alter table public.film_clips enable row level security;

create policy film_select on public.film
  for select to authenticated
  using (app.can_view_film(id));
create policy film_insert on public.film
  for insert to authenticated
  with check (app.can_write_film(team_id, folder_id) and created_by = auth.uid());
create policy film_update on public.film
  for update to authenticated
  using (app.can_write_film(team_id, folder_id))
  with check (app.can_write_film(team_id, folder_id));
create policy film_delete on public.film
  for delete to authenticated
  using (app.can_write_film(team_id, folder_id));

create policy clips_select on public.film_clips
  for select to authenticated
  using (app.is_staff(team_id) or (play_id is not null and app.can_view_play(play_id)));
create policy clips_insert on public.film_clips
  for insert to authenticated
  with check (app.is_staff(team_id));
create policy clips_update on public.film_clips
  for update to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));
create policy clips_delete on public.film_clips
  for delete to authenticated
  using (app.is_staff(team_id));

revoke all on table public.film from public, anon, authenticated;
grant select, delete on table public.film to authenticated;
grant insert (team_id, folder_id, title, opponent, game_date, size_bytes, created_by)
  on table public.film to authenticated;
grant update (folder_id, title, opponent, game_date, status)
  on table public.film to authenticated;
grant all on table public.film to service_role;

revoke all on table public.film_clips from public, anon, authenticated;
grant select, delete on table public.film_clips to authenticated;
grant insert (
  team_id, film_id, play_number, start_ms, end_ms, side, quarter, down, distance, hash,
  yard_line, personnel, formation, front, coverage, result, gain_loss, play_id, look_id, tags
) on table public.film_clips to authenticated;
grant update (
  play_number, start_ms, end_ms, side, quarter, down, distance, hash, yard_line,
  personnel, formation, front, coverage, result, gain_loss, play_id, look_id, tags
) on table public.film_clips to authenticated;
grant all on table public.film_clips to service_role;

-- 6. Storage: a private bucket, 20 GiB per file, video and thumbnail types only. Reads go
-- through short-lived signed URLs, which the policies below gate.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'film', 'film', false, 21474836480,
  array['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy film_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'film' and app.can_read_film_object(name));
create policy film_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'film' and app.can_upload_film_object(name));
-- Resumable uploads may overwrite the same key while the film is still uploading.
create policy film_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'film' and app.can_upload_film_object(name))
  with check (bucket_id = 'film' and app.can_upload_film_object(name));
create policy film_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'film' and app.can_delete_film_object(name));

commit;
