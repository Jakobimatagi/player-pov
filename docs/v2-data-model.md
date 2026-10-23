```sql
-- L4: which slot in a play is "this player's own POV" when a position has several slots (e.g. 3 WRs).
create table player_slots (
  team_id uuid not null references teams on delete cascade,
  play_id uuid not null references plays on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  slot text not null,
  primary key (play_id, user_id)
);
create table plays (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null, side text not null default 'offense' check (side in ('offense','defense')),
  formation text, tags text[] not null default '{}',
  current_version int, archived_at timestamptz,
  created_by uuid references auth.users, created_at timestamptz default now()
);
create table play_versions (
  play_id uuid references plays on delete cascade, version int not null,
  source jsonb not null, compiled jsonb not null,
  source_schema smallint not null, compiled_schema smallint not null,
  compiler_version text not null, checksum text not null,
  created_by uuid references auth.users, created_at timestamptz default now(),
  primary key (play_id, version)
);   -- no UPDATE/DELETE policy: versions are immutable
create table scout_looks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  side text not null check (side in ('offense','defense')),
  name text not null, front text, coverage text, opponent text,
  current_version int, created_by uuid, created_at timestamptz default now()
);
create table scout_look_versions (
  look_id uuid references scout_looks on delete cascade, version int,
  source jsonb not null, checksum text not null, created_by uuid, created_at timestamptz default now(),
  primary key (look_id, version)
);
create table scout_packages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null, opponent text, week_of date, created_by uuid, created_at timestamptz default now()
);
create table scout_package_looks (package_id uuid references scout_packages on delete cascade,
  look_id uuid references scout_looks on delete cascade, sort int not null, primary key (package_id, look_id));
create table playbooks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null, description text, archived_at timestamptz,
  created_by uuid, created_at timestamptz default now()
);
create table playbook_plays (playbook_id uuid references playbooks on delete cascade,
  play_id uuid references plays on delete cascade, sort int not null,
  pinned_version int,                   -- null = always current
  primary key (playbook_id, play_id));
-- Assignments: playbook or package -> a player or a position group.
create table assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  playbook_id uuid references playbooks on delete cascade,
  package_id uuid references scout_packages on delete cascade,
  assignee_user uuid references auth.users on delete cascade,
  assignee_group position_group,
  due_at timestamptz, created_by uuid, created_at timestamptz default now(),
  check ((playbook_id is null) <> (package_id is null)),
  check ((assignee_user is null) <> (assignee_group is null))
);
create view assignment_targets with (security_invoker = true) as
  select a.id assignment_id, a.team_id, m.user_id, a.playbook_id, a.package_id, a.due_at
  from assignments a join memberships m on m.team_id = a.team_id and m.role = 'player'
   and (m.user_id = a.assignee_user or position_group_of(m.position) = a.assignee_group);
```
RLS (v2 §4):
```sql
create function app.can_view_play(p uuid) returns boolean ... $$
  select exists (select 1 from public.plays pl where pl.id = p and (app.is_staff(pl.team_id) or exists (
    select 1 from public.assignment_targets at join public.playbook_plays pp on pp.playbook_id = at.playbook_id
    where at.user_id = auth.uid() and pp.play_id = p))) $$;
create policy looks_select on scout_looks for select using (app.is_staff(team_id) or exists (select 1 from assignment_targets at
  join scout_package_looks spl on spl.package_id = at.package_id where at.user_id = auth.uid() and spl.look_id = scout_looks.id));
```
Policy matrix: plays/play_versions: head_coach and coach S I U(plays) / S I; player S **assigned only**; non-member none. scout_looks/packages: staff S I U D; player S assigned packages only. playbooks/playbook_plays: staff S I U D; player S assigned. assignments: staff S I U D; player S own (resolved). `assignee_user` must be a player on the same team. play_versions can't be updated or deleted by anyone.
pgTAP fixture: team A with t1 (head_coach), c1 (coach), p_qb (player QB), p_fs (player S); team B with t2. P1 is in PB1, which is assigned to group QB; P2 is unassigned. Assert: p_qb sees P1 but not P2; p_fs sees neither until PB1 is assigned to DB; c1 sees and edits P1 and P2; t2 sees zero team-A rows in every table; play_versions are immutable.

C3 note for later: since players read only assigned plays, C3 needs the assignments table and the assignment_targets view (playbook path) so can_view_play works. Defer package_id to the scout-packages PR if scout_packages isn't created yet. A linked look must be readable by players who can view a play that links to it; adjust looks_select for that and report it.
