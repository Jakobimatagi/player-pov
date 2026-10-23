# Playbook data

Plays live in Postgres. Staff write them. A player reads a play only when a playbook that contains it is assigned to that player, and only while the play is not archived. These checks are the pgTAP file `supabase/tests/plays.test.sql`. Run them on local Postgres only.

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
- The update changes no rows. Postgres does not raise for an update hidden by row level security.
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

- The call fails with `P0409` and the message `version conflict`.
- The play still has two versions.

## Scenario 5 — Archive hides the play

**Preconditions:** The quarterback can see the play. The coach can see it too.

**Steps:**

1. As the coach, set `archived_at` to now.
2. Read the play as the coach and as the quarterback.

**Expected:**

- Neither role sees the play.
