-- Rollback for 20261207000000_film.sql: no film and no clips. Video already in the R2
-- bucket is not removed here; empty it from the Cloudflare dashboard if needed.

begin;

drop function if exists public.film_object_allowed(text, text);

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
