# Play calls: the 3 A's and 3 R's

Every play call answers six questions for every position on the side the play is for (`plays.side`):

| Phase     | Field      | Question                                            |
| --------- | ---------- | --------------------------------------------------- |
| Pre-snap  | Alignment  | Where do I line up?                                 |
| Pre-snap  | Assignment | What is my job on the snap?                         |
| Pre-snap  | Adjustment | What changes vs motion, shifts or other formations? |
| Post-snap | Read       | What do I look at after the snap?                   |
| Post-snap | Recognize  | What does it tell me?                               |
| Post-snap | React      | What do I do about it?                              |

Coaching points stay optional. Scout-look players (the other side on the board) can have rules, but they're optional too.

A play is a **Draft** until it is published. Players never see a draft: `app.can_view_play` requires `plays.published_at`. `publish_play` refuses (`23514`) while `app.play_rule_gaps` lists any position. On a published play, clearing or deleting an answer is refused, so the coach unpublishes first. Saving a version that adds a position with no answers puts the play back to Draft. Only the head coach or the coordinator of the play's side can publish or unpublish. The database checks are in `supabase/tests/play_calls.test.sql`.

The play sheet is `/plays/:playId`. It shows a board with every player at their alignment and the path they run, offense moving up. Below it are our positions, then the scout look, which is folded away. The card shows the picked position's answers. `?pos=<slot>` opens a position.

## Scenario 1 — Coach sees what's missing

**Preconditions:** `npm run dev` with no backend. Open `/plays/flood`.

**Expected:**

- The bar reads `Draft` and `4 of 11 positions have all 3 A's and 3 R's`. **Publish to players** is disabled.
- A banner lists the positions still missing answers.
- On the board, our players carry a green ✓ or a red ! badge. The list rows have green or red edges and read `6 of 6`, `2 of 6` and so on.
- The card opens on the first incomplete position. Blank required fields have red borders, and the line under Save names what is still needed.

## Scenario 2 — Fill the gaps and publish

**Steps:** For each red position, fill all six fields and click **Save**. Then click **Publish to players**.

**Expected:** The meter reaches 11 of 11, the badges turn green, and Publish enables. After publishing, the bar reads `Published` and a note says assigned players can now open the play.

## Scenario 3 — A published play keeps its answers

**Steps:** On the published play, clear React for the QB and click **Save**.

**Expected:** Save fails with "This play is published, so every answer has to stay filled in. Unpublish it to clear one." Click **Unpublish**: the bar reads `Draft` again, and players lose the play until it is republished.

## Scenario 4 — Player reads the play call

**Preconditions:** Open `/plays/flood?roster=player` (the demo player is H). With a backend, sign in as a player assigned a published play, and open it from Player Home.

**Expected:**

- The card reads `Your job: H #11`, with Pre-snap and Post-snap answers. Nothing is editable. There is no meter, no Draft badge and no Publish button.
- H has a `YOU` tag on the board and a `You` chip in the list. Tapping a teammate shows their answers, and **Back to my position** returns.
- **Watch in 3D** opens the helmet view, where the rule card shows the same answers.
- At 390px wide the card comes straight after the board, before the position lists. The page does not scroll sideways.

## Scenario 5 — Coordinators

**Preconditions:** A backend, with the OC and DC named (see `scenarios/coordinators.md`).

**Expected:** On an offense play the DC sees **Publish to players** missing and the offense cards read-only, but can still write scout-look rules for the defenders. The OC can fill offense answers and publish. The playbook list shows a `Draft` or `Published` badge on every play for staff, and the play name opens the sheet.
