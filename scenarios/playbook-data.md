# Playbook data

Plays live in Postgres. Staff write them. A player reads a play only when a playbook that contains it is assigned to that player, and only while the play and that playbook are not archived. These checks are the pgTAP file `supabase/tests/plays.test.sql`. Run them on local Postgres only. Edited in place: the playbook must also be unarchived.

```bash
supabase db reset --local
supabase test db --local
```

Do not point this at the hosted project, and do not run `seed.sql` anywhere but local.

## Scenario 1 — A coach writes a play

**Preconditions:** Local database has been reset. Team A has a coach.

**Steps:**

1. Call `save_play_version` as the coach with `p_expected` null.

**Expected:**

- The call returns version 1.
- A second call with `p_expected` 1 returns version 2.

## Scenario 2 — A player cannot write

**Preconditions:** The quarterback can read the assigned play.

**Steps:**

1. As that player, insert a row into `plays`.
2. As that player, update the assigned play's name.
3. As that player, call `save_play_version`.

**Expected:**

- The insert fails with `42501`.
- The update changes no rows. Postgres does not raise for an update hidden by row level security. The playbook screen shows the word `forbidden`.
- `save_play_version` fails with `42501` and the message `forbidden`.

## Scenario 3 — Another team sees nothing

**Preconditions:** Team B has a head coach and no Team A membership.

**Steps:**

1. As that coach, count Team A rows in `plays`, `play_versions`, `scout_looks`, `scout_look_versions`, `playbooks`, `playbook_plays`, `assignments`, and `assignment_targets`.

**Expected:**

- Every count is 0.

## Scenario 4 — A stale version conflicts

**Preconditions:** The play's current version is 2.

**Steps:**

1. Call `save_play_version` again with `p_expected` 1.

**Expected:**

- The call fails with `PT409` and the message `version conflict`. PostgREST turns that into HTTP 409.
- The play still has two versions.

## Scenario 5 — Archive hides the play from the player

**Preconditions:** The quarterback can see the play. The coach can see it too.

**Steps:**

1. As the coach, set `archived_at` to now.
2. Read the play as the coach and as the quarterback.
3. As the coach, set `archived_at` back to null.

**Expected:**

- The coach still sees the archived play and can restore it.
- The assigned player does not see it until it is restored.

## Scenario 6 — An archived playbook hides its plays

**Preconditions:** The quarterback can see a play filed in an assigned playbook. The play itself is not archived.

**Steps:**

1. As the coach, set that playbook's `archived_at` to now.
2. Read the play as the quarterback and as the coach.
3. As the coach, set the playbook's `archived_at` back to null.

**Expected:**

- The quarterback does not see the play while the playbook is archived.
- The coach still sees it.

## Scenario 7 — created_by is the caller

**Preconditions:** The coach is signed in.

**Steps:**

1. Insert a playbook and an assignment without `created_by`.
2. Insert another playbook, and another assignment, with `created_by` set to a user on the other team.

**Expected:**

- The omitted column is stored as the coach's user id.
- Each spoofed insert fails with `42501`.
- `playbook_plays` has no `created_by` column, in this migration and in `docs/v2-data-model.md`, so there is nothing to stamp on that table.

## Scenario 8 — Another team's play is not found

**Preconditions:** Team B has a saved play. The caller is a coach on Team A.

**Steps:**

1. Call `save_play_version` with `p_team` set to Team A and `p_play` set to the Team B play.

**Expected:**

- The call fails with `P0002` and the message `play not found`.
