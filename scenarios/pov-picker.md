# Watch as

The camera bar has a **Watch as** control. It lists the loaded play, grouped into Offense and Defense, in the snap hop order. Each entry is the alignment name and jersey, such as `QB #7` or `Mike #52`. Picking an entry attaches that player and switches to POV.

A single-word player id is the name (`qb` → QB, `mike` → Mike, `sam` → Sam). Any other id uses the position field (`de_l` → DE). A blank position with an id that is not a word shows only the jersey (`#24`).

The shell still follows `scenarios/responsive.md` scenario 1.

## Scenario 1 — Pick from the list

**Preconditions:** http://127.0.0.1:5173 is open in Broadcast. Nobody is attached.

**Steps:**

1. Click **Watch as**.
2. Under Defense, click `Mike #52`.

**Expected:**

- The list closes.
- The button reads `Watch as: Mike #52`.
- `data-mode` is `pov` and `data-attached` is `mike`. `data-watch` is `mike`.
- The POV button is the selected camera. Mike's own box is hidden.
- Offense is listed as `X #1`, `LT #76`, `LG #66`, `RB #22`, `QB #7`, `C #55`, `RG #64`, `RT #72`, `Y #88`, `H #84`, `Z #11`.

## Scenario 2 — Click and arrow hops stay in sync

**Preconditions:** Broadcast, nobody attached.

**Steps:**

1. Click the quarterback.
2. Press `→`.
3. Press `1`.
4. Press `→` again.
5. Press `2`.
6. Press `Escape`.
7. Press `1`.

**Expected:**

- After the click, the mode stays Broadcast, `data-attached` is `qb`, and the button reads `Watch as: QB #7`.
- The first `→` selects `Watch as: C #55` and `data-attached` is `c`.
- `1` enters POV. The button still reads `Watch as: C #55`.
- The second `→` selects the next offensive player, `RG #64`, and POV follows him.
- `2` leaves POV. `data-attached` stays `rg`. The button reads `Watch as` and `data-watch` is empty.
- `Escape` clears `data-attached`. The button stays `Watch as`.
- `1` with nobody attached looks through the QB, and the button stays `Watch as`. The fallback QB is not a selection.
- On a coarse pointer, **Hop right** updates the button the same way `→` does.

## Scenario 3 — Phone layout

**Preconditions:** The sample play is loaded.

**Steps:**

1. Set the viewport to 360×800 and reload.
2. Open **Watch as**.
3. Repeat the no-scroll check at 768×1024, 1024×768, 1366×768, and 1920×1080 with the list open, then closed.

**Expected:**

- At 360 the list is a bottom sheet (`data-sheet` is `true`) sitting above the camera bar. Offense and Defense are both on screen or reached by scrolling inside the sheet.
- The camera buttons stay visible and usable. The sheet does not cover them.
- **Watch as**, **Close**, and every option are at least 44×44. Text is at least 14px.
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at 360, 768, 1024, 1366, and 1920, with the list open and with it closed.
- From 768 up the list is a menu anchored to the button, not a full-width sheet.

## Scenario 4 — Keyboard access

**Preconditions:** Broadcast, nobody attached. Focus is not in a text field.

**Steps:**

1. Tab until **Watch as** is focused. It comes after POV, Broadcast, and Top-down.
2. Press `↓`.
3. Press `↓` again, then Enter.
4. Open the list again and press `Escape`.

**Expected:**

- `↓` or `↑` on the closed button opens the list. It does not hop and the page does not scroll.
- Focus starts on `X #1`. The next `↓` moves to `LT #76`. `data-attached` stays empty while the list is open.
- Enter chooses LT. The list closes, the mode is POV, `data-attached` and `data-watch` are `lt`, and the button reads `Watch as: LT #76`.
- `Escape` closes the list and returns focus to **Watch as**. The selection does not change.
- `1`, `2`, and `3` do nothing while the list is open. Arrow keys do not hop while it is open.

## Scenario 5 — Switching plays

**Steps:**

1. Run `npx vitest run tests/watch.test.ts`.

**Expected:**

- Choosing a player sets POV, attach, and Watch as together.
- A click-attach or a hop updates Watch as without requiring a new pick.
- Leaving POV clears Watch as and leaves the player attached. Detach clears both.
- When the play id changes, attach and Watch as clear. The same play id does not clear them.
- Pressing POV with nobody attached does not fill Watch as.

## Scenario 6 — A play missing a position label

**Steps:**

1. Open **Watch as** and find the defensive ends.
2. Run `npx vitest run tests/watch.test.ts`.

**Expected:**

- `de_l` is shown as `DE #95`, and `de_r` as `DE #91`. The id is not the label, because it is not a position word.
- A player whose id is not a word and whose position is blank is listed as the jersey only. `#24` is the case for id `cb_1` and jersey 24.
