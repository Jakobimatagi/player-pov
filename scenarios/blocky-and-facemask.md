# Blocky players and the facemask

Phase 2 swaps the box art for eight blocks through `PlayerVisual`. The sampler, camera rig, hop order, and picking stay as they were. The facemask is an SVG on top of the canvas, only in POV.

The viewer shell still follows `scenarios/responsive.md` scenario 1.

## Scenario 1 — Blocky bodies

**Preconditions:** http://127.0.0.1:5173 is open in Broadcast.

**Steps:**

1. Look at a player from the sideline.

**Expected:**

- Each player is a crouch of helmet, torso, arms, and legs, not a single box.
- Offense is red with dark trim. Defense is white with dark trim.
- Jersey numbers still sit on the chest and the sides.
- `npm test` reports at most 160 triangles on `blockyVisual`.

## Scenario 2 — Facemask only in POV

**Steps:**

1. Press `1` or double-tap a player so the mode is POV.
2. Press `2` to return to Broadcast.
3. Click a player while the facemask is up.

**Expected:**

- In POV a dark bar sits on each side and a team-colored band sits along the bottom. The middle of the picture stays clear.
- The overlay fades in about 200 ms.
- In Broadcast the overlay is gone.
- Clicks and taps land on the players. The overlay does not take them.
- At 360 the bars are thinner than at 1366.

## Scenario 3 — Art swap stays behind the seam

**Steps:**

1. Diff `src/play/sample.ts`, `src/scene/CameraRig.tsx`, and `src/camera/hop.ts` against the unlit branch.

**Expected:**

- Those files are unchanged.
- `Players.tsx` selects `blockyVisual` in the default argument.
