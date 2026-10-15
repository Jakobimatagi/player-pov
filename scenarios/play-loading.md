# Play loading and validation

The engine loads one fixture, `/plays/trips-right-vs-cover2.json`. There is no play picker. Run `npm run dev` unless a step uses the unit tests.

## Scenario 1 — The sample play loads

**Preconditions:** Dev server running. WebGL available.

**Steps:**

1. Open http://127.0.0.1:5173 .

**Expected:**

- The page leaves the `Loading play…` state.
- The canvas is shown.
- The load-error panel is not shown.

## Scenario 2 — schemaVersion 2 is rejected first

**Preconditions:** Unit tests, or a temporary edit of the fixture.

**Steps:**

1. Set `schemaVersion` to `2` on an otherwise valid play and load it.

**Expected:**

- The only error is `schemaVersion: unsupported play format v2`.
- The canvas is not shown.

## Scenario 3 — A 404 names the URL and status

**Steps:**

1. Open http://127.0.0.1:5173/?play=/plays/missing.json . That query is the only accepted way to point the loader at another fixture. Anything other than `/plays/<name>.json` stays on the sample.

**Expected:**

- The load-error panel shows that URL.
- The message is `HTTP 404` when the server returns 404.
- A 200 whose content-type is `text/html`, or whose body starts with `<`, is `not found`. That is Vite's `index.html` fallback for a missing file, not a JSON parse error.
- **Retry** is present. There is no Browse or Share control.

## Scenario 4 — Non-JSON includes line and column

**Steps:**

1. Return a 200 body that is not JSON, such as `{`.

**Expected:**

- The error kind is parse.
- The message includes `line` and `column`.

## Scenario 5 — Structural and semantic failures name a path

**Steps:**

1. Run `npm test` and read `tests/schema.test.ts`, or mutate the fixture for each case below.

**Expected:** each case fails, and `python3 schema/validate.py <file> schema/play.schema.json` fails the same way:

- 21 players, path `players`
- duplicate jersey, path `players[1].jersey`
- a waypoint time that is not greater than the previous one, path ending in `.t`, message `must be greater than previous`
- last waypoint `t` not equal to `meta.duration`
- a ball segment whose `t1` does not meet the next `t0`
- `carrier` set to an unknown id
- a handoff whose end holder is not the next segment's start holder
- a segment faster than 11 yd/s
- an offensive player with snap `x` greater than the line of scrimmage
- an unknown JSON key

## Scenario 6 — Pre-snap time is valid

**Steps:**

1. Set one player's first waypoint to `t: -1.5` and leave the rest of the sample intact.

**Expected:**

- Validation succeeds.
- `validate.py` prints `OK`.

## Scenario 7 — A close snap is a warning, not a failure

**Steps:**

1. Place two players 0.3 yd apart at `t = 0`.

**Expected:**

- The play still loads.
- A warning mentions `within 0.5 yd at the snap`.
- With `--warn`, `validate.py` prints a `WARN snap` line and exits 0.

## Scenario 8 — Sixty errors are capped and grouped

**Steps:**

1. Give two players enough non-increasing waypoint times to total 60 semantic errors, with every track still ending at `meta.duration`.

**Expected:**

- The panel lists 50 lines.
- The text `…and 10 more` is visible.
- Lines for the first player appear before lines for the second.
