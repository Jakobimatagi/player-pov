-- Rollback for 20261213000000_film_local_clips.sql: deletes every Hudl export game (its
-- clips and clip files go with it), then restores the upload-only film table and guards.

begin;

drop table if exists public.film_clip_files;
drop function if exists app.guard_film_clip_file();
alter table public.film_clips drop constraint if exists film_clips_team_id_id_key;

drop trigger if exists film_guard_delete on public.film;
drop function if exists app.guard_film_delete();
drop policy if exists film_delete on public.film;
revoke delete on table public.film from authenticated;
revoke insert (source) on table public.film from authenticated;

delete from public.film where source = 'hudl_export';

alter table public.film drop constraint if exists film_source_shape;
alter table public.film drop constraint film_status_check;
alter table public.film add constraint film_status_check
  check (status in ('uploading', 'processing', 'ready', 'failed'));
alter table public.film drop constraint film_size_bytes_check;
alter table public.film add constraint film_size_bytes_check
  check (size_bytes > 0 and size_bytes <= 21474836480);
alter table public.film alter column size_bytes set not null;
alter table public.film alter column storage_key set not null;
alter table public.film drop column source;

-- The guards as 20261207000000_film.sql wrote them.
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
    new.storage_key := new.team_id || '/' || new.id || '/original';
    if uid is not null then
      new.created_by := uid;
      new.status := 'uploading';
      new.proxy_key := null;
      new.duration_ms := null;
    end if;
    if new.size_bytes is null or new.size_bytes <= 0 or new.size_bytes > 21474836480 then
      raise exception 'one film file is at most 20 GiB' using errcode = '23514';
    end if;
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

create or replace function app.guard_film_clip()
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

commit;
