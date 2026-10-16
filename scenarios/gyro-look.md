# Gyro look

In POV, **Look with phone** turns device tilt into the same free-look yaw and pitch as a finger drag. It is shown only in POV, only on a coarse pointer (`matchMedia('(pointer: coarse)')`), and only when `DeviceOrientationEvent` exists. It is off until you turn it on. The choice is saved on this device under `localStorage` key `pov.lookWithPhone` (`1` on, `0` off). A missing key is off.

On iOS the first enable calls `DeviceOrientationEvent.requestPermission()` from the tap. If the saved value is on but this load needs that prompt, the control stays off and nothing asks until you tap it. A denied prompt or a second and a half with no orientation event marks the control blocked. It does not throw. The next tap clears that block and tries again. Leaving POV, and unmounting the control, removes the `deviceorientation` listener so Broadcast and Top-down do not keep rendering for phone samples.

The pose when you turn it on is forward. Later tilt is relative to that pose. Yaw stops at about ±100° and pitch at about ±35°. The offset is smoothed. Portrait and landscape use `screen.orientation.angle`, or `window.orientation` when that is missing. Rotating the screen resets the view to forward and takes that pose as the new baseline. A finger drag still looks, and adds to the phone offset, and that drag stays inside the same yaw and pitch limits. Escape or a hop recenters and takes a new baseline while the control stays on. Turning the control off removes the `deviceorientation` listener immediately and eases the view back to forward.

`npm run dev` exposes `window.__pov.look` and `window.__pov.gyroListening()` so a scenario can read the offset. Production builds do not.

## Scenario 1 — The toggle is off until you press it

**Preconditions:** POV at http://127.0.0.1:5173 . Clear `pov.lookWithPhone` if a previous run set it. `DeviceOrientationEvent` exists. The primary pointer is coarse.

**Steps:**

1. Press `1`.
2. Press `2`, then `1` again.

**Expected:**

- **Look with phone** is on the camera row with **Watch as** and **Hold look**. Its accessible name is `Look with phone`.
- `aria-pressed` is false, and the button is not red.
- It is absent in Broadcast and Top-down, and back in POV.
- The button is at least 44×44. At 360 the row wraps if it needs to, and the page does not scroll sideways.

## Scenario 2 — Tilt looks, then a drag adds

**Preconditions:** POV. A phone, or desktop with a synthetic `deviceorientation` event.

**Steps:**

1. Tap **Look with phone**.
2. Dispatch a baseline event (`alpha` 0, `beta` 70, `gamma` 0), then one with `beta` 50.
3. Drag one finger a short distance to the left.

**Expected:**

- The button is red and `aria-pressed` is true. `window.__pov.gyroListening()` is true.
- After the second event the view pitches up, about 20°, and yaw stays near 0. It eases there instead of snapping.
- The drag looks further to the player's left and does not erase the pitch.
- Yaw still stops near ±100° and pitch near ±35°.

## Scenario 3 — Landscape uses the other axis

**Steps:**

1. Run `npx vitest run tests/gyro.test.ts`.

**Expected:**

- The same 20° gamma tilt is yaw in portrait and pitch when the screen angle is 90°.
- `-90` and `270` are the same screen angle.

## Scenario 4 — Escape and hop take a new baseline

**Preconditions:** POV, **Look with phone** on, view tilted.

**Steps:**

1. Press Escape.
2. Turn **Look with phone** on again if the hop flow left it on, tilt, then hop with a chip or `→`.

**Expected:**

- Escape looks straight ahead. The phone's current pose is the new forward, so the same tilt no longer turns the view.
- A hop does the same recenter for the new player. The control stays available.
- Hold look's pressed state is unchanged.

## Scenario 5 — Permission denied

**Preconditions:** POV. `DeviceOrientationEvent.requestPermission` is stubbed to resolve `'denied'` or to reject.

**Steps:**

1. Tap **Look with phone**.

**Expected:**

- The page does not throw.
- The listener is not left attached. `window.__pov.gyroListening()` is false.
- The button stays pressable, shows `data-gyro="blocked"`, is not red, and `aria-pressed` is false.
- `pov.lookWithPhone` is `0`.
- The next tap clears the block and asks again. A granted result turns the control on.

## Scenario 6 — Turning look off

**Preconditions:** POV. **Look with phone** is on and the view is tilted. `pov.lookWithPhone` is `1`.

**Steps:**

1. Tap **Look with phone** so it turns off.
2. Dispatch another `deviceorientation` event, or tilt the phone.
3. Reload http://127.0.0.1:5173 and press `1`.

**Expected:**

- The `deviceorientation` listener is removed immediately. `window.__pov.gyroListening()` is false, and the later event does not move the view.
- The view eases back to forward. It does not stay turned and it does not snap.
- `aria-pressed` is false and the button is not red.
- After reload the control is off. `pov.lookWithPhone` is still `0`.

## Scenario 7 — A saved On does not prompt by itself

**Preconditions:** `pov.lookWithPhone` is `1`. This browser has `DeviceOrientationEvent.requestPermission` (iOS).

**Steps:**

1. Reload and press `1`.
2. Do not tap **Look with phone**.

**Expected:**

- The button is shown off. `aria-pressed` is false.
- Nothing calls `requestPermission` until a tap.
- A browser without `requestPermission` and a saved `1` turns the control on while loading POV, without a prompt.

## Scenario 8 — 360px phone width

**Preconditions:** http://127.0.0.1:5173 at 360×800. Coarse pointer. POV.

**Steps:**

1. Press `1`.
2. Look at the camera row.

**Expected:**

- The page does not scroll sideways.
- Below 768px the watch row sits on its own line under the camera buttons.
- **Watch as**, **Hold look**, and **Look with phone** are each at least 44×44 and stay inside the row. Long labels ellipsize instead of widening the page.

## Scenario 9 — Rotating the screen looks forward

**Preconditions:** POV, **Look with phone** on, view tilted. Or `npx vitest run tests/gyro.test.ts`.

**Steps:**

1. Change the screen angle, for example portrait to landscape, while the same tilt is held.

**Expected:**

- The view returns to forward. Yaw and pitch are about 0.
- That rotated pose is the new baseline, so holding the same tilt does not turn the view again.
- The control stays on. `window.__pov.gyroListening()` is still true.
