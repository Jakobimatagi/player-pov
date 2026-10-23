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

1. As the quarterback, read packages, looks, and package looks.

**Expected:**

- The quarterback sees PK1 and its look.
- The quarterback does not see PK2 or its look.

## Scenario 3 — Another team and an unassigned player see nothing

**Preconditions:** Scenario 1. The safety is not assigned the package. Team B has a head coach.

**Steps:**

1. As the safety, count packages, looks, and slots.
2. As Team B's coach, count Team A packages, looks, package looks, slots, and assignments.

**Expected:**

- Every count is 0.

## Scenario 4 — A player slot is the player's own row

**Preconditions:** Flood is in a playbook assigned to quarterbacks. The coach set that player's slot to `qb`.

**Steps:**

1. Read `player_slots` as the quarterback, the safety, and Team B's coach.

**Expected:**

- The quarterback sees `qb`.
- The safety and the other team see no slots.
- v2 does not name a `player_slots` policy. Staff write a slot. A player reads their own slot on a play they can view.
