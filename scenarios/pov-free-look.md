# POV free-look

In POV, a mouse drag or a one-finger drag looks around the attached player. The eye stays at helmet height and keeps following that player. Yaw is relative to the player's facing and stops at about ±100°. Pitch stops at about ±35°. About 1 s after the pointer goes up, the view eases back to forward. **Hold look** keeps the offset.

Playback does not pause, and the scrubber does not follow the pointer. A tap with no movement still attaches. In POV a one-finger drag is look, so hopping is the hop chips or a two-finger swipe. The facemask is a screen overlay and stays put. The offset resets when the attached player changes, on every **Watch as** pick, and on Escape. Leaving POV with the same player keeps it. Opening the Watch as list does not clear Hold look, and keys still go to that list while it is open.

Broadcast and Top-down still hop on a one-finger swipe. That check is `scenarios/touch.md` scenario 3. The shell still follows `scenarios/responsive.md` scenario 1.

## Scenario 1 — Drag limits

**Preconditions:** http://127.0.0.1:5173 is open. Press `1` so the mode is POV.

**Steps:**

1. Drag across the field, then drag up and down, until the view stops turning.
2. Run `npx vitest run tests/camera.test.ts`.

**Expected:**

- Yaw stops at about ±100° from the player's facing. Pitch stops at about ±35°.
- The camera stays at eye height (1.75 yd) and moves with the player. It does not roll.
- The same clamps are what the unit test checks.

## Scenario 2 — Easing back

**Preconditions:** POV, Hold look off.

**Steps:**

1. Drag until the view is clearly off to one side.
2. Release, wait about 1 second, and keep watching.

**Expected:**

- For about 1 s the offset stays where you left it.
- It then eases back to straight downfield. It does not snap.

## Scenario 3 — Hold look

**Preconditions:** POV.

**Steps:**

1. Click **Hold look**, then drag and release.
2. Wait 2 seconds.
3. Click **Hold look** again and wait about 1 second.
4. Turn **Hold look** on, drag aside, and open **Watch as**. Press `1`, then `↓`.

**Expected:**

- The button's name is `Hold look`, it is at least 44×44, and it shows pressed after step 1.
- The offset stays after release while it is pressed.
- After it is turned off, the view eases back to forward about 1 s later.
- **Hold look** sits beside **Watch as**. At 360 that pair wraps onto its own row under the camera buttons, both targets stay at least 44×44, and the page does not scroll sideways.
- While the list is open, **Hold look** stays pressed and the offset stays put. `1` does not change the mode. `↓` moves in the list and does not hop.

## Scenario 4 — Playback keeps running

**Preconditions:** POV. Press Space so the play is running. Note `data-testid="clock-readout"`.

**Steps:**

1. Drag across the field for about a second. Stay off the time range.

**Expected:**

- The clock readout keeps increasing.
- The time range keeps advancing with the clock. It does not jump to where the pointer is.
- The button still says **Pause**. The drag did not pause playback.

## Scenario 5 — Two-finger or chip hop

**Preconditions:** Touch emulation or a touchscreen. POV, and the quarterback is attached (`data-attached` is `qb`).

**Steps:**

1. Drag one finger across the field, more than 60 px.
2. On a coarse pointer, tap **Hop right**. On any pointer, swipe two fingers to the right across the field, more than 60 px in under 400 ms.

**Expected:**

- The one-finger drag looks around. `data-attached` stays `qb`.
- **Hop right**, or the two-finger swipe, attaches the next player to offense's right (C).
- A two-finger swipe up or down attaches the nearest defender.
- Broadcast and Top-down still hop on a one-finger swipe (`scenarios/touch.md` scenario 3).

## Scenario 6 — Tap still attaches

**Preconditions:** Broadcast. Touch emulation may be on.

**Steps:**

1. Tap the quarterback's box without dragging.
2. Press `1`. Tap H without dragging.
3. Drag across the field, then release on a player.

**Expected:**

- Step 1 attaches the QB. `data-attached` is `qb`. The mode stays Broadcast.
- Step 2 attaches H. `data-attached` is `h`.
- The drag looks, once POV is on, and does not change who is attached.

## Scenario 7 — The facemask stays fixed

**Preconditions:** POV, so `data-testid="facemask"` has `data-active="true"`.

**Steps:**

1. Note the side bars and the bottom band.
2. Drag to yaw and pitch.
3. Press `2`.

**Expected:**

- The bars stay pinned to the screen while the field turns behind them. They do not slide, roll, or scale with the drag.
- Clicks pass through the overlay.
- At 360 the side bars are thinner than at 768 and up.
- Broadcast sets `data-active` to `false` and the overlay is gone.
- There is no shadow on the bars.

## Scenario 8 — Reset on hop or leaving POV

**Preconditions:** POV, attached to the QB, Hold look on, view dragged off to the side.

**Steps:**

1. Press `→`, or hop with a chip or a two-finger swipe.
2. Drag aside again, then press `2`, then press `1`.
3. Drag aside again. Open **Watch as** and pick the player who is already attached.
4. Drag aside again and press `Escape`.

**Expected:**

- Step 1 looks out of the new player's face, straight ahead. The old offset is gone.
- Step 2 leaves POV and comes back on the same player with the offset still there.
- Step 3 clears the offset even though that player was already attached. The view looks straight out of their face.
- Escape clears the offset. `data-attached` is empty, and POV falls back to the QB looking straight ahead.
- Escape while the Watch as list is open closes the list and leaves the offset alone. That list still takes the keys (`scenarios/pov-picker.md` scenario 4).
