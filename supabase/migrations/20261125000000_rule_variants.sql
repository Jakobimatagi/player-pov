-- "vs" exceptions on position rules.
-- Rollback (not applied by supabase db push): supabase/down/20261125000000_rule_variants.sql
--
-- A position's base rule (position_rules) is what it does every snap. An exception
-- changes some of its answers against one kind of look:
--   scope 'look'       one formation: a library id ('lib:gun-trips-rt') or a scout look id
--   scope 'structure'  every formation with that receiver structure ('3x1', 'empty', ...)
--   scope 'personnel'  every formation with that personnel ('12', '21', ...)
-- The most specific match wins, per answer: look, then structure, then personnel, then
-- the base. A blank (null) answer inherits, so an exception can never blank one out,
-- and the publish gate on the base rule still holds.

begin;

create table public.position_rule_variants (
  play_id uuid not null references public.plays on delete cascade,
  slot text not null check (length(slot) between 1 and 32),
  scope text not null check (scope in ('look', 'structure', 'personnel')),
  match text not null,
  team_id uuid not null references public.teams on delete cascade,
  -- Side of the player in the play, read from the current version. Not client-set.
  side text not null check (side in ('offense', 'defense')),
  alignment text check (length(alignment) <= 280),
  assignment text check (length(assignment) <= 500),
  adjustment text check (length(adjustment) <= 500),
  key_read text check (length(key_read) <= 280),
  recognize text check (length(recognize) <= 280),
  react text check (length(react) <= 500),
  notes text check (length(notes) <= 1000),
  updated_by uuid default auth.uid() references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  primary key (play_id, slot, scope, match),
  constraint position_rule_variants_match_check check (
    case scope
      when 'look' then length(match) between 1 and 80
      when 'structure' then match in ('1x1', '2x1', '2x2', '3x1', '3x2', '4x1', 'empty')
      when 'personnel' then match ~ '^[0-3][0-4]$'
    end
  ),
  -- An exception with nothing in it is just the base rule; delete it instead.
  constraint position_rule_variants_not_empty check (
    coalesce(alignment, assignment, adjustment, key_read, recognize, react, notes) is not null
  )
);

create index position_rule_variants_play_idx on public.position_rule_variants (play_id);

-- Same stamping as position_rules: team and side come from the play, and the slot must
-- be in its current version.
-- Content changes only: a user delete cascading `updated_by` to null must not re-run
-- the slot check.
create trigger position_rule_variants_stamp
  before insert or update of slot, alignment, assignment, adjustment, key_read, recognize, react, notes
  on public.position_rule_variants
  for each row execute function app.stamp_position_rule();

alter table public.position_rule_variants enable row level security;

-- Whoever can read the play reads every exception on it.
create policy variants_select on public.position_rule_variants
  for select to authenticated
  using (app.can_view_play(play_id) or app.is_staff(team_id));
create policy variants_insert on public.position_rule_variants
  for insert to authenticated
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy variants_update on public.position_rule_variants
  for update to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side))
  with check (app.is_staff(team_id) and app.can_edit_side(team_id, side));
create policy variants_delete on public.position_rule_variants
  for delete to authenticated
  using (app.is_staff(team_id) and app.can_edit_side(team_id, side));

revoke all on table public.position_rule_variants from public, anon, authenticated;
grant select, insert, delete on table public.position_rule_variants to authenticated;
grant update (alignment, assignment, adjustment, key_read, recognize, react, notes)
  on table public.position_rule_variants to authenticated;
grant all on table public.position_rule_variants to service_role;

commit;
