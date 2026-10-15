# Performance budget

Phase 1 stays at or under 10 draw calls and 2,500 triangles. The ladder only drops resolution, then distant jersey numbers, then route lines and the camera update rate. Players, the ball, the field markings, and the facemask stay on.

`?perf=1` shows the level, draw calls, and triangles, logs a rolling p50/p95 about every 10 seconds, and replays the sample instead of stopping. The first 2 seconds after load, resize, context restore, or returning to the tab are ignored. A hidden tab freezes the sampler.

The Chromebook gate in the design (p95 ≤ 16.6 ms at L0 or L1 on a Celeron with 4 GB) is not run in this environment. `docs/perf.md` records the machine that was measured and says so.

## Scenario 1 — Overlay and replay

**Preconditions:** Dev server running. WebGL available.

**Steps:**

1. Open http://127.0.0.1:5173/?perf=1 .
2. Wait until the play clock passes the end of the play.

**Expected:**

- A readout starts with `L0` or `L1` and includes `calls` and `tris`.
- The play keeps running instead of stopping on Replay.
- The console shows a `perf p50` line within about 10 seconds of frames.

## Scenario 2 — Ladder behavior

**Preconditions:** The unit tests in `tests/quality.test.ts` are the check. This scenario is the same contract in words.

**Steps:**

1. Run `npm test`.

**Expected:**

- 90 frames at 21 ms step down one level.
- 3 frames above 50 ms inside 1 second step down immediately.
- 300 frames at 16.7 ms step up one level.
- 300 frames with 5% at 18 ms do not step up.
- A second drop inside the 2 second cooldown does not happen.
- Three up-then-down flaps inside 60 seconds lock that level.
- A frame above 250 ms is ignored.
- Restoring the context at L2 stays at L2.

## Scenario 3 — Paused frameloop

**Steps:**

1. Open the viewer and leave the play paused.
2. Stop interacting for a second.

**Expected:**

- The picture holds still.
- Moving the time range or pressing Play updates the frame again.

## Scenario 4 — Phase 2 re-gate

**Preconditions:** Blocky players are the default art.

**Steps:**

1. Open http://127.0.0.1:5173/?perf=1 .
2. Run `npx vitest run tests/budget.test.ts`.

**Expected:**

- The overlay shows 6 calls and 3854 tris in Broadcast.
- The budget test passes: at most 6,000 triangles, and the jersey atlas is the 1024² texture (4 MiB).
- The facemask does not add a call.
- `docs/perf.md` records that the Celeron p95 gate and the 10 minute soak were not run on this machine.
