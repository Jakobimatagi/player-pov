# Waypoint cap

A compiled track allows 12 waypoints. One more is a schema error on that player's `waypoints` path. Route ribbons thin to 129 chords, so a full chart stays at or under 258 triangles and 10 meshes.

## Scenario 1 — Twelve waypoints pass

**Preconditions:** `schema/requirements.txt` is installed. `fixtures/trips-12wp.source.json` gives every offensive player eleven legs whose times sum to the play duration.

**Steps:**

1. Run `npm run compile -- fixtures/trips-12wp.source.json`.
2. Save that JSON and run `python schema/validate.py <file> schema/play.schema.json`.
3. Run `npx vitest run tests/schema.test.ts`.

**Expected:**

- The command prints a play file.
- Each offensive player has 12 waypoints.
- `validate.py` prints `OK: schema + semantic checks pass`.
- The schema test accepts a 12-waypoint track and matches `validate.py`.

## Scenario 2 — Thirteen waypoints are rejected with a path

**Preconditions:** The unit tests in `tests/schema.test.ts` and `tests/routes.test.ts` are the check.

**Steps:**

1. Add one waypoint to a player who already has 12, keeping times increasing and the last `t` equal to the duration.
2. Run `npx vitest run tests/schema.test.ts tests/routes.test.ts`.

**Expected:**

- Validation fails.
- The error path is `players[0].waypoints` for the first player.
- `validate.py` fails the same play.

## Scenario 3 — Long routes thin without growing triangles

**Preconditions:** `tests/budget.test.ts` builds 22 players × 12 waypoints.

**Steps:**

1. Run `npx vitest run tests/budget.test.ts tests/routes.test.ts`.

**Expected:**

- Ribbon triangles are at most 258.
- Mesh tags across the field, players, ball, and route ribbon are at most 10.
- A route past the chord cap thins. The triangle count does not grow with the extra waypoints.

Frame time on `fixtures/trips-12wp.source.json` stays within 5% of the short chart. The Celeron measurement is recorded in the pull request. This environment may have to use the closest proxy.
