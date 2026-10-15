# Touch and mobile

Pointer events on the canvas attach, hop, orbit, and pinch. The scrubber sits outside the canvas, so a swipe on it never changes the attached player. `touch-action: none` is set on the canvas. Hit testing uses a 1.5× invisible box around each player.

The shell still follows `scenarios/responsive.md` scenario 1. Hop chips are part of that scenario: they show only for a coarse pointer, and only while a player is attached.

Chrome DevTools device mode (or a touchscreen) is enough. A fine pointer still clicks and drags with the mouse.

## Scenario 1 — Tap attaches

**Preconditions:** http://127.0.0.1:5173 is open in Broadcast. Touch emulation is on, or you are using a touchscreen.

**Steps:**

1. Tap the quarterback's box.

**Expected:**

- The box tints gold.
- The camera bar's `data-attached` is `qb`.
- The mode stays Broadcast.

## Scenario 2 — Double-tap enters POV

**Steps:**

1. Double-tap H within 300 ms.

**Expected:**

- The mode becomes POV.
- `data-attached` is `h`.
- H's own box is hidden.

## Scenario 3 — Swipe hops

**Preconditions:** The QB is attached.

**Steps:**

1. Swipe right across the field, more than 60 px in under 400 ms, mostly horizontal.
2. Swipe up or down the same way.

**Expected:**

- The right swipe attaches the next player toward offense's right. From the QB that is C, then RG.
- The vertical swipe attaches the nearest defender.
- The page does not scroll.

## Scenario 4 — Broadcast orbit and pinch

**Preconditions:** Broadcast, nobody needs to be attached.

**Steps:**

1. Drag slowly across the canvas (more than 10 px, and either under 60 px or longer than 400 ms).
2. Pinch two fingers together and apart.
3. Wait 4 seconds without touching.

**Expected:**

- The drag orbits the focus. Yaw stays within ±60° of the sideline and pitch stays within 15–60°.
- Pinch changes the camera distance and never leaves 12–60 yd. The ball stays in frame.
- After 4 s the view eases back to the default sideline angle.
- A two-finger drag does not pan.

## Scenario 5 — Top-down pinch and POV pinch

**Steps:**

1. Switch to Top-down and pinch.
2. Switch to POV and pinch.

**Expected:**

- Top-down zoom stays between half and twice the fit.
- POV does not zoom.

## Scenario 6 — Empty field and the scrubber

**Preconditions:** A player is attached in Broadcast.

**Steps:**

1. Tap empty grass.
2. Attach the QB again and swipe on the time range, not on the field.

**Expected:**

- The empty tap clears `data-attached`.
- The scrubber swipe moves the play clock and does not hop.

## Scenario 7 — Coarse hop chips

**Preconditions:** DevTools is set to a coarse pointer, or this is a touchscreen. A player is attached.

**Steps:**

1. Look beside the scrubber.

**Expected:**

- **Hop left** and **Hop right** are visible and at least 44×44.
- Hop right matches a right swipe: the next player in snap order.
- On a fine pointer those chips are absent.
