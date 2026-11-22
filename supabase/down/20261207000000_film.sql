-- Rollback for 20261207000000_film.sql: no film, no clips, no film bucket policies.
-- Objects already in the `film` bucket are not removed here. Empty the bucket through the
-- Storage API first, then this drops the bucket row.

begin;

drop policy if exists film_objects_select on storage.objects;
drop policy if exists film_objects_insert on storage.objects;
drop policy if exists film_objects_update on storage.objects;
drop policy if exists film_objects_delete on storage.objects;
-- Storage refuses direct deletes unless this is set. The bucket goes only when empty.
set local storage.allow_delete_query = 'true';
delete from storage.buckets
where id = 'film' and not exists (select 1 from storage.objects where bucket_id = 'film');

-- film_of_object returns the film row type, so it goes before the table.
drop function if exists app.can_delete_film_object(text);
drop function if exists app.can_upload_film_object(text);
drop function if exists app.can_read_film_object(text);
drop function if exists app.film_of_object(text);

drop table if exists public.film_clips;
drop table if exists public.film;

drop function if exists app.guard_film_clip();
drop function if exists app.guard_film();
drop function if exists app.can_view_film(uuid);
drop function if exists app.can_write_film(uuid, uuid);

alter table public.teams drop column if exists film_quota_bytes;
alter table public.plays drop constraint if exists plays_team_id_id_key;

commit;
