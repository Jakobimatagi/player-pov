# Sampling

Motion is checked by the unit tests. There is no on-screen control for it yet. Run the commands from the repo root.

## Scenario 1 — Waypoint poses and a resting snap

**Steps:**

1. Run `npx vitest run tests/sample.test.ts tests/facing.test.ts`.

**Expected:**

- A pose sampled at a waypoint time matches that waypoint within 1e-4 yards.
- A smooth segment has velocity 0 at `t = 0`.
- Velocity matches on both sides of a smooth waypoint.
- A segment marked `linear` keeps a constant speed and stays on the chord.

## Scenario 2 — Time outside the track

**Steps:**

1. Read the clamp test in `tests/sample.test.ts`, or sample a compiled play at `duration + 3` and at `first t − 1`.

**Expected:**

- Position is the first or last waypoint.
- Velocity is 0.
- Heading is the final `face` when that waypoint has one, otherwise the held heading.

## Scenario 3 — Facing

**Steps:**

1. Run the facing tests.

**Expected:**

- An explicit face from 170° to −170° is halfway through 180°, not through 0°.
- Speed under 0.4 yd/s does not change heading.
- A sample with `dt > 0.1` snaps heading to the unsmoothed target.
- Turn rate stays within 720°/s.

## Scenario 4 — Allocation

**Steps:**

1. Run the 10k-call test in `tests/sample.test.ts` (Vitest is started with `--expose-gc`).

**Expected:**

- After the 10k calls, a GC leaves `heapUsed` no higher than before the loop. The hot path builds no objects, arrays, or closures.
- Each call is under 0.02 ms.
