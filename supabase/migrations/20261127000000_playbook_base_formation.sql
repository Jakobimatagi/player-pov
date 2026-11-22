-- A playbook can carry a base alignment: the offensive formation a new play drawn in it
-- starts from. It is a key of the app's formation presets (e.g. 'gun-spread'). Null means
-- the book has none and inherits from the nearest folder above it that does.
alter table public.playbooks add column base_formation text;

grant update (base_formation) on table public.playbooks to authenticated;
