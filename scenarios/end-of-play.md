# End of play

v1 does not loop. The sample play is 4.00 seconds.

## Scenario 1 — Stop at the end

**Preconditions:** Sample play loaded.

**Steps:**

1. Open http://127.0.0.1:5173/ .
2. Click **Play** and wait, or drag the slider to the end.

**Expected:**

- Playback stops at 4.00.
- **Replay** appears.
- The play does not start over by itself.

## Scenario 2 — Replay

**Steps:**

1. From the stopped end, click **Replay**.

**Expected:**

- Time returns to 0.00 and the play runs again. If a play's first waypoint is before the snap, time returns to that waypoint instead of 0.
- The camera mode and the attached player, once those exist, stay as they were.

## Scenario 3 — Space at the end replays

**Steps:**

1. Let the play stop at the end, or drag the slider there.
2. Press Space.

**Expected:**

- Space calls the same action as **Replay**: time returns to the first waypoint and the play runs.
- Space during the play still toggles pause. It does not jump back to the start.
