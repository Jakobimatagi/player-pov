# Attach and hop

Click a player to attach. The order is fixed at the snap: offense left to right is X, LT, LG, RB, QB, C, RG, RT, Y, H, Z. Arrows do not scroll the page.

The shell still follows `scenarios/responsive.md` scenario 1. This step adds no new page chrome.

## Scenario 1 — Click attaches and highlights

**Preconditions:** http://127.0.0.1:5173 is open in Broadcast.

**Steps:**

1. Click the quarterback's box.

**Expected:**

- That player's jersey number tints gold. The box keeps its team color.
- The camera bar's `data-attached` is `qb`.
- The mode stays Broadcast.
- The framing eases toward him over about 0.6 s.

## Scenario 2 — Double-click or P enters POV

**Steps:**

1. Double-click H, or click H and press `P`.

**Expected:**

- The mode becomes POV on H.
- H's own box is hidden.
- `data-attached` is `h`.

## Scenario 3 — Arrows hop

**Preconditions:** The QB is attached.

**Steps:**

1. Press `→`, then `→` again.
2. Press `←` until you pass the left end.
3. Press `↑` or `↓`.
4. Press `Escape`.

**Expected:**

- `→` goes QB, then C, then RG, wrapping after Z back to X.
- `←` goes the other way and wraps from X to Z.
- `↑` or `↓` attaches the closest defender at the current time.
- The page does not scroll.
- `Escape` clears `data-attached`. The mode stays where it was. In POV the view falls back to the QB, and his box hides again because POV always has a subject.
- The same keys do nothing while a text field is focused.

## Scenario 4 — Hop at the end of the play

**Steps:**

1. Scrub to the end (`data-testid="clock-readout"` reads `4.00 / 4.00`).
2. Attach any player and press `→`.

**Expected:**

- The hop still lands on the next player in the snap order.
- The players are holding their final spots. Nothing pops or disappears.

## Scenario 5 — Order is the unit-tested snap order

**Steps:**

1. Run `npx vitest run tests/hop.test.ts`.

**Expected:**

- Offense order is `x, lt, lg, rb, qb, c, rg, rt, y, h, z`.
- Right from the QB is C. Left from X wraps to Z.
- The nearest-opponent check picks the closer defender.
