# Roster sheet and depth chart

Two staff-only pages under **Team**, beside **Members**:

- **Roster sheet** (`/team/roster`): the coach's full roster, including players with no app account yet. Columns: number, name, position, grad year, other positions, height, weight, account, staff notes.
- **Depth chart** (`/team/depth`): Offense, Defense and Special teams drawn as position cards where players line up. Clicking a card sets who plays there, starter first, up to 6 deep.

Data is football-only on purpose (`roster_players`, `depth_chart`): no contact details, birthdates or addresses. Players can't read either table, not even their own row, so staff notes stay with staff. The invite form is unchanged and still has no number field (`scenarios/team-management.md`).

Rules enforced by the database:

- Any staff member edits roster details. A player's position on a row with an app account keeps the existing rule: only the head coach changes it, and the change also updates their membership (which drives playbook assignment by position group).
- Depth chart by side: the OC sets offense, the DC sets defense, special teams are shared. The head coach and coaches with no side set all three. Changes go through `set_depth`, which replaces a position's order in one step.
- Every player membership gets a roster row automatically. Removing the membership removes that row and its depth chart spots.
- **Merge** folds a typed-in row (no account) into an account holder's row once they accept an invite: blanks are filled from the typed-in row, and its depth spots move over.

With no backend, both pages run on a 25-player demo roster.

## Scenario 1 — Fill the roster

**Steps:**

1. Open `/team/roster` and click **Paste from spreadsheet**.
2. Paste rows copied from a spreadsheet (number, name, positions, grad year, height, weight) and click **Add N to roster**.
3. Change a height to `6-2` and press Enter. Type `abc` in a weight and press Enter.

**Expected:** The rows appear. The height shows `6'2"`. The bad weight is outlined red and isn't saved; Escape restores it. The filter chips narrow the list by side using primary and other positions.

## Scenario 2 — Set the depth chart

**Steps:** Open `/team/depth`, click the **LT** card, choose a player from **Add to LT** (players who play OL are listed first), and move them up.

**Expected:** The card shows the new starter's number and name, plus `2.` for the backup. The panel lists other positions each player holds ("also RDT"). On a phone the panel opens as a bottom sheet.

## Scenario 3 — Coordinator limits

**Preconditions:** Signed in as the DC.

**Expected:** The page opens on Defense. Defense cards are editable. Offense cards open view-only with a note. Special teams are editable.
