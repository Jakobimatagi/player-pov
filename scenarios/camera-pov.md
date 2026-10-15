# POV camera

Labels are **POV**, **Broadcast**, and **Top-down**. The default mode is Broadcast. Run `npm run dev` and open http://127.0.0.1:5173 .

## Scenario 1 — Key 1 looks out of the quarterback

**Preconditions:** The sample play is loaded and paused at 0.

**Steps:**

1. Press `1`, or click **POV**.

**Expected:**

- The view is from the QB's helmet height (1.75 yd), a short step in front of him, looking 10 yd downfield.
- The QB's own box is hidden.
- The button's accessible name is `POV`.
- `1` does nothing while typing in a text field.

## Scenario 2 — A nearby box fades

**Steps:**

1. Run `npx vitest run tests/camera.test.ts`.

**Expected:**

- A player within 0.4 yd of the POV eye fades to 30% opacity.
- A player at 0.4 yd or farther stays solid.
- The fade is an instance attribute, not another draw call.

## Scenario 3 — A large seek snaps

**Preconditions:** POV is selected and the play is paused past 1 second.

**Steps:**

1. Drag the scrubber back by more than half a second in one move.

**Expected:**

- The POV camera jumps to the new spot in one frame. It does not glide across the field.
- Broadcast and Top-down still glide (about 0.2 s) on that same kind of seek.

## Scenario 4 — Scrubbing during a mode change

**Steps:**

1. Press `3` to start the change to Top-down.
2. About 0.3 s later, scrub the play back 2 seconds.
3. Wait until 0.6 s after the key press.

**Expected:**

- The change still finishes at 0.6 s in Top-down.
- The picture does not flip upside down and no value goes blank.
- The unit test "finishes a mode change 0.6 s later even if the play is scrubbed" covers the same case.
