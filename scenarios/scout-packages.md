# Scout packages

Packages, the looks inside them, and player slots live in Postgres. Staff write them. A player reads a look when a package that contains it is assigned to that player. These checks are `supabase/tests/scout_packages.test.sql`. Run them on local Postgres only.

```bash
supabase db reset --local
supabase test db --local
```

Do not point this at the hosted project, and do not run `seed.sql` anywhere but local.

## Scenario 1 — A coach files a look in a package

**Preconditions:** Local database has been reset. Team A has a coach.

**Steps:**

1. Save two plays, then clear each play's `default_look_id`.
2. Create packages PK1 and PK2 and put one look in each.
3. Assign PK1 to the quarterback group.

**Expected:**

- The coach sees both packages and both looks.
- `assignment_targets.package_id` is PK1 for the quarterback.

## Scenario 2 — An assigned player reads the package

**Preconditions:** Scenario 1. The looks are not linked from a play.

**Steps:**

1. As the quarterback, read packages, looks, package looks, and look versions.

**Expected:**

- The quarterback sees PK1, its look, and that look's version.
- The quarterback does not see PK2 or its look.
- Edited in place: the version read is part of this scenario.

## Scenario 3 — Another team and an unassigned player see nothing

**Preconditions:** Scenario 1. The safety is not assigned the package. Team B has a head coach.

**Steps:**

1. As the safety, count packages, looks, look versions, and slots.
2. As Team B's coach, count Team A packages, looks, package looks, slots, and assignments.

**Expected:**

- Every count is 0, including look versions for the look in PK1.
- Edited in place: the safety's look-version count is part of this scenario.

## Scenario 4 — A player slot is the player's own row

**Preconditions:** Flood is in a playbook assigned to quarterbacks. The coach set that player's slot to `qb`.

**Steps:**

1. Read `player_slots` as the quarterback, the safety, and Team B's coach.

**Expected:**

- The quarterback sees `qb`.
- The safety and the other team see no slots.
- v2 does not name a `player_slots` policy. Staff write a slot. A player reads their own slot on a play they can view.

## Scenario 5 — Cross-team rows are rejected

**Preconditions:** Scenario 1. Team B has its own play, look, and package.

**Steps:**

1. File Team B's look in Team A's package.
2. Assign Team B's package to Team A's quarterbacks.
3. Insert a Team A slot whose play is Team B's play.
4. Link Team B's play into Team A's playbook with the team guard switched off, then read it as the quarterback.
5. Point Team A's play at Team B's look with the foreign key switched off, then read that look as the coach and the quarterback.

**Expected:**

- The package look, the assignment, and the slot each fail with `23514`.
- The quarterback sees no Team B play, play version, look, or look version through the link.
- Neither the coach nor the quarterback sees Team B's look through the cross-team `default_look_id`.
- `app.guard_package_look` is trigger-only. `anon` and `authenticated` lack `EXECUTE`, and `proconfig` pins `search_path`.
- `scout_packages.created_at` is not null. Changing `team_id` on a look or a package is rejected.
