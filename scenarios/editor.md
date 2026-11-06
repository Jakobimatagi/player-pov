# Editor

The play draw board. C5 adds the editor core: the reducer, hit testing, and a read-only SVG chart. The dev-only page `/dev/editor` is the harness for these checks. It loads `fixtures/trips-flood.source.json` against `COVER_2_LOOK`. Production builds do not have that route. Dragging, adding waypoints, saving and the **Edit play** entry come in C6 and C7.

## Scenario 1 — Render all 22 players

**Preconditions:** `npm run dev` is running.

**Steps:**

1. Open http://127.0.0.1:5173/dev/editor at a desktop width.

**Expected:**

- The title reads "Trips Right Flood". The status reads "Nothing selected".
- A green field with yard lines, hash marks and a blue line of scrimmage fills the width of the page.
- 11 offense players show as white circles labelled LT, LG, C, RG, RT, QB, RB, X, Z, H, Y. The offense moves to the right, and X is above the line (the offense's left).
- 11 defense players show as red labels: DE, DT, DT, DE, S, M, W, CB, CB, SS, FS. The CBs line up 1 yd off X and Z.
- H has one white route with an arrowhead and the labels "stem", "corner" and "flatten". No other player has a route.
- The console has no errors.

## Scenario 2 — Select a player, a waypoint, or nothing

**Preconditions:** Scenario 1 is on screen.

**Steps:**

1. Click the H circle.
2. Click the first bend of H's route (the "stem" corner).
3. Click an empty spot of grass.
4. Click H again, then press Escape.
5. Click a defender's label, for example M.

**Expected:**

- After step 1 the status reads "Selected: WR #11 (h)". H has a yellow ring, its route turns yellow, and its waypoints show as yellow dots.
- After step 2 the status reads "Selected: WR #11 (h), leg 1" and that waypoint dot is filled.
- After steps 3 and 4 the status reads "Nothing selected" and the route is white again.
- After step 5 the status reads "Selected: LB #55 (mike)".
- A click up to 22 px from a player's centre still selects it (44 px target), whatever the window size.

## Scenario 3 — Undo and redo

**Preconditions:** Scenario 1 is on screen. Undo and Redo are greyed out.

**Steps:**

1. Click H, then click **Nudge 1 yd** twice.
2. Click **Undo**.
3. Press Cmd+Z (Ctrl+Z on Windows or ChromeOS).
4. Press Shift+Cmd+Z (Shift+Ctrl+Z).
5. Click **Redo**.

**Expected:**

- After step 1, H and its whole route sit 2 yd further right, and **Undo** is enabled.
- After step 2, H is 1 yd right of where it started and **Redo** is enabled.
- After step 3, H is back where it started, **Undo** is greyed out, and H is still selected.
- After steps 4 and 5, H is 2 yd right again and **Redo** is greyed out.

## Scenario 4 — Undo a waypoint move

**Preconditions:** Scenario 1 is on screen.

**Steps:**

1. Click the "stem" bend of H's route, then click **Nudge 1 yd**.
2. Click **Undo**.

**Expected:**

- After step 1 only that bend moves 1 yd right. H, the "corner" point and the "flatten" point stay where they were.
- After step 2 the route is back to its first shape.

## Scenario 5 — Narrow window

**Preconditions:** Scenario 1 is on screen.

**Steps:**

1. Make the window 375 px wide, or use a phone.

**Expected:**

- The field shrinks to the page width and keeps its shape. The page does not scroll sideways.
- Undo, Redo and Nudge 1 yd are each at least 44 px tall.
