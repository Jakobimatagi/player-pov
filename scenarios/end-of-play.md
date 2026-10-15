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

- Time returns to 0.00 and the play runs again.
- The camera mode and the attached player, once those exist, stay as they were.
