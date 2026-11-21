# Coordinators and position rules

The head coach can mark any coach as **Offensive coordinator** or **Defensive coordinator** (`memberships.coordinates`). Playbooks carry a side (`playbooks.side`: offense, defense, or shared). Each play holds **position rules** for each player in it (`position_rules`, keyed by play and player id): Alignment, Assignment, Key / read, and Coaching points.

Who can edit what (`app.can_edit_side`, mirrored by `canEditSide` in `src/auth/sides.ts`):

| Member                | Offense books and rules | Defense books and rules | Shared books |
| --------------------- | ----------------------- | ----------------------- | ------------ |
| Head coach            | Edit                    | Edit                    | Edit         |
| Offensive coordinator | Edit                    | View                    | Edit         |
| Defensive coordinator | View                    | Edit                    | Edit         |
| Coach with no side    | Edit                    | Edit                    | Edit         |
| Player                | View if assigned        | View if assigned        | —            |

A rule's side is the side of that player in the play, read by the database from the play's current version. On an offense play, the DC still writes the rules for the defenders in the scout look.

Players read every rule on a play they're assigned, so they can see teammates' jobs. The rule card shows the rules for the player the camera follows. A locked player always sees their own.

## Scenario 1 — Name the coordinators

**Preconditions:** Signed in as the head coach, on `/team`.

**Steps:** Open `⋯` on a coach. Set **Coordinator** to Offense (OC). Do the same with another coach and Defense (DC).

**Expected:** The roster shows `Offensive coordinator` and `Defensive coordinator`. Only the head coach sees this control.

## Scenario 2 — Side playbooks

**Preconditions:** Signed in as the DC, on `/playbook`.

**Expected:**

- The side filter starts on **Defense**. Offense books are hidden until **All** or **Offense** is picked.
- **New folder** at the top level offers Defense or Shared, not Offense.
- Folders inside a book take its side.
- Offense books have no Rename or Delete for the DC, and opening one shows no toolbar.
- **Generate playbook** (offense templates) is hidden for the DC.

## Scenario 3 — Write rules

**Preconditions:** Signed in as the DC. Open a saved play.

**Steps:** Click **Position rules**. Open `FS`, fill Alignment, Assignment and Key / read, and click **Save**.

**Expected:**

- `Saved` appears and the FS row shows the assignment.
- The Offense group is marked `view only` with read-only fields.
- Clearing every field and saving removes the rule.
- Signed in as the OC, the FS fields are read-only and the QB fields save.

## Scenario 4 — Player sees their job

**Preconditions:** Scenario 3 done. The FS player is assigned the play and the `fs` slot.

**Expected:** The play opens in the FS helmet with a card reading `Your job: FS #…` and the coach's rules. Switching to Broadcast or Top-down keeps the card.
