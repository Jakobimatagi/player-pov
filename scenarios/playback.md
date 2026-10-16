# Playback

The scrubber sits on the viewer. `window.__pov` is available in `npm run dev`.

## Scenario 1 — Play and pause

**Preconditions:** Sample play loaded. WebGL available.

**Steps:**

1. Open http://127.0.0.1:5173/ .
2. Click **Play**.
3. Click **Pause**.

**Expected:**

- The boxes move after Play.
- Pause freezes them. The readout keeps that time.
- Pressing Space does the same toggle.

## Scenario 2 — Scrub and rates

**Steps:**

1. Drag the time slider to about 2.00.
2. Click **0.5×**, then **Play**.
3. Click **2×**.

**Expected:**

- The same slider time shows the same formation on a second visit.
- 0.5× moves the play slower than 1×. 2× moves it faster.
- The chips are **0.25×**, **0.5×**, **1×**, **1.5×**, and **2×**. Quarter speed is always on the bar. The phone layout is `scenarios/playback-rates.md`.

## Scenario 3 — Step keys

**Steps:**

1. Press `,` then `.`

**Expected:**

- Time moves by about 0.1 seconds backward, then forward.
- The page does not scroll.

## Scenario 4 — Hidden tab

**Steps:**

1. Click **Play**.
2. Switch to another tab for a few seconds.
3. Come back.

**Expected:**

- Playback is paused.
- The time matches the moment you left. It did not jump by the hidden duration.

## Scenario 5 — Route lines

**Steps:**

1. Click **Show routes**.
2. Click **Hide routes**.

**Expected:**

- Pale ribbons trace each player's waypoints while shown. They are much thicker than a 1px hairline, about 6 CSS pixels, in POV, Broadcast, and Top-down.
- On a 360px-wide phone the ribbons stay readable in each camera. Compare `docs/routes-360-pov.png`, `docs/routes-360-broadcast.png`, and `docs/routes-360-topdown.png`.
- They disappear when hidden. The play clock is unchanged.
- Routes are one draw. With the sample play they are 180 triangles, and the scene including them stays within the 2,000 triangle budget.

## Scenario 6 — Controls fit a 360px phone

**Preconditions:** Sample play loaded.

**Steps:**

1. Open http://127.0.0.1:5173/ at 360×800.
2. Inspect **Play**, each speed chip, and the time slider.

**Expected:**

- The page does not scroll horizontally.
- The scrubber wraps onto extra rows instead of running off the screen.
- **Play**, each speed, and the slider's hit area are at least 44×44 px.
