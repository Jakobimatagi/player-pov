# Top-down camera

Top-down is orthographic. Offense moves up the screen.

## Scenario 1 — Key 3 looks straight down

**Steps:**

1. Open http://127.0.0.1:5173 .
2. Press `3`, or click **Top-down**.

**Expected:**

- The view moves to overhead over about 0.6 s. The picture does not pop in size when the orthographic camera takes over, and it does not flip.
- The offense's direction is toward the top of the screen.
- The formation fits, with padding around it.
- On a phone the visible word is `Top`. The accessible name is `Top-down`.

## Scenario 2 — Resize keeps the fit

**Steps:**

1. While Top-down is showing, resize the window wider, then taller.
2. Run `npx vitest run tests/camera.test.ts`.

**Expected:**

- A wider window does not crop the play when height was already the limit.
- A taller window can zoom in until the width is the limit.
- The field is not stretched.
