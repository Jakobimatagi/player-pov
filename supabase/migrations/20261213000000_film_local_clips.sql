-- Game film from a Hudl export that stays on the coach's computer (issues #97, #98).
-- Rollback (not applied by supabase db push): supabase/down/20261213000000_film_local_clips.sql
--
-- 1. film.source: 'upload' is the stored-video film of 20261207000000_film.sql (R2,
--    retired in #104). 'hudl_export' is a game whose clips are read in the coach's browser
--    and never uploaded: it has no size, no storage key, no proxy, and the status 'local'.
--    It does not count toward the team's film quota. A coach can delete it directly,
--    since there is no stored object to clean up first.
-- 2. film_clips on a hudl_export film: one row per play. start_ms and end_ms are a time
--    range inside that play's own clip files (0 to the longest angle at import), not
--    inside one game file. A film holds each play number once.
-- 3. film_clip_files: which local file each clip came from, one row per angle, with a
--    fingerprint (size plus a SHA-256 of the first and last MiB) so re-opening the same
--    export matches the saved rows instead of adding them again. Staff only; players
--    never see file names.

begin;

-- 1. Local film.
alter table public.film
  add column source text not null default 'upload'
    check (source in ('upload', 'hudl_export'));

alter table public.film alter column size_bytes drop not null;
alter table public.film alter column storage_key drop not null;

alter table public.film drop constraint film_size_bytes_check;
alter table public.film add constraint film_size_bytes_check
  check (size_bytes is null or (size_bytes > 0 and size_bytes <= 21474836480));

alter table public.film drop constraint film_status_check;
alter table public.film add constraint film_status_check
  check (status in ('uploading', 'processing', 'ready', 'failed', 'local'));

alter table public.film add constraint film_source_shape check (
  case source
    when 'upload' then
      size_bytes is not null and storage_key is not null and status <> 'local'
    else
      size_bytes is null and storage_key is null and proxy_key is null and status = 'local'
  end
);

-- Same as before for uploads; a hudl_export film skips the file, size and quota.
create or replace function app.guard_film()
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
    if uid is not null then
      new.created_by := uid;
    end if;
    if new.source = 'hudl_export' then
      new.storage_key := null;
      new.size_bytes := null;
      new.proxy_key := null;
      new.duration_ms := null;
      new.status := 'local';
      return new;
    end if;
    new.storage_key := new.team_id || '/' || new.id || '/original';
    if uid is not null then
      new.status := 'uploading';
      new.proxy_key := null;
      new.duration_ms := null;
    end if;
    -- The size check comes before the quota so an oversize file gets the right message.
    if new.size_bytes is null or new.size_bytes <= 0 or new.size_bytes > 21474836480 then
      raise exception 'one film file is at most 20 GiB' using errcode = '23514';
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
       or new.source is distinct from old.source
       or new.storage_key is distinct from old.storage_key
       or new.size_bytes is distinct from old.size_bytes
       or new.created_by is distinct from old.created_by then
      raise exception 'team, source, file and uploader cannot change' using errcode = '42501';
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

grant insert (source) on table public.film to authenticated;

-- A local film has nothing in storage, so its editor deletes the row (and its clips).
-- Uploaded film still goes through the film-storage function: the policy lets the row
-- through so film_guard_delete can refuse it out loud.
create policy film_delete on public.film
  for delete to authenticated
  using (app.can_write_film(team_id, folder_id));
grant delete on table public.film to authenticated;

-- RLS alone would make deleting an uploaded film a silent no-op; say no instead.
create function app.guard_film_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source <> 'hudl_export' and auth.uid() is not null then
    raise exception 'uploaded film is deleted through the film-storage function'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger film_guard_delete
  before delete on public.film
  for each row execute function app.guard_film_delete();

revoke all on function app.guard_film_delete() from public, anon, authenticated;

-- 2. One clip per play number on a local film. Same rules as before otherwise.
create or replace function app.guard_film_clip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  film_length int;
  film_source text;
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

  select duration_ms, source into film_length, film_source
  from public.film where id = new.film_id;
  if film_length is not null and new.end_ms > film_length then
    raise exception 'clip ends after the film does' using errcode = '23514';
  end if;

  if film_source = 'hudl_export'
     and (tg_op = 'INSERT' or new.play_number is distinct from old.play_number) then
    if new.play_number is null then
      raise exception 'a clip from an export needs its play number' using errcode = '23514';
    end if;
    -- Two imports of the same export at once must not both add play N.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.film_id::text, 98));
    if exists (
      select 1 from public.film_clips
      where film_id = new.film_id and play_number = new.play_number and id <> new.id
    ) then
      raise exception 'play % is already on this film', new.play_number using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

-- 3. Clip files.
alter table public.film_clips add constraint film_clips_team_id_id_key unique (team_id, id);

create table public.film_clip_files (
  clip_id uuid not null,
  team_id uuid not null references public.teams on delete cascade,
  angle text not null check (length(btrim(angle)) between 1 and 40),
  -- The path inside the export, e.g. "Wide - Clip 007.mp4".
  file_name text not null check (length(file_name) between 1 and 255),
  size_bytes bigint not null check (size_bytes > 0),
  -- SHA-256 of the first and last MiB (the whole file when it is 2 MiB or less), hex.
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (clip_id, angle),
  foreign key (team_id, clip_id) references public.film_clips (team_id, id) on delete cascade
);

create index film_clip_files_fingerprint_idx
  on public.film_clip_files (team_id, sha256, size_bytes);

-- Files belong to clips on a local film.
create function app.guard_film_clip_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.film_clips c
    join public.film f on f.id = c.film_id
    where c.id = new.clip_id and f.source = 'hudl_export'
  ) then
    raise exception 'only clips from an export have local files' using errcode = '23514';
  end if;
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger film_clip_files_guard
  before insert on public.film_clip_files
  for each row execute function app.guard_film_clip_file();

revoke all on function app.guard_film_clip_file() from public, anon, authenticated;

alter table public.film_clip_files enable row level security;

create policy clip_files_select on public.film_clip_files
  for select to authenticated
  using (app.is_staff(team_id));
create policy clip_files_insert on public.film_clip_files
  for insert to authenticated
  with check (app.is_staff(team_id));
create policy clip_files_delete on public.film_clip_files
  for delete to authenticated
  using (app.is_staff(team_id));

revoke all on table public.film_clip_files from public, anon, authenticated;
grant select, delete on table public.film_clip_files to authenticated;
grant insert (clip_id, team_id, angle, file_name, size_bytes, sha256)
  on table public.film_clip_files to authenticated;
grant all on table public.film_clip_files to service_role;

commit;
