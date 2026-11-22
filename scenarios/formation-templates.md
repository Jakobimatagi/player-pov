# Formation templates

A coach saves their own formation (offense or defense) and uses it anywhere a built-in works: the diagram editor's picker, a playbook's base alignment, and the play sheet's **Facing** strip.

## Pieces

- **Table** `formation_templates` (`supabase/migrations/20261201000000_formation_templates.sql`): team, side, name, eleven spots (`slot`, `dx`, `dy`, optional `label` and `color`). Slots are the ones the built-in presets use. A name is unique per team and side among live templates. `supabase/tests/formation_templates.test.sql` covers the database rules.
- **Keys**: a template is `tpl:<uuid>`. Look-up goes built-in preset first, then team template (`resolveFormation` in `src/diagram/templates.ts`).
- **Side rules**: an OC saves offense, a DC defense; the head coach and coaches with no side save both. Every coach reads all of the team's templates. Players and other teams read none.
- **Delete** archives. An archived template leaves the pickers, but a playbook that uses it as its base alignment keeps it, and its name is free again.
- **Demo**: with no backend, templates live in this tab's session storage.

## Scenario 1 — Save the field as a formation

**Preconditions:** `npm run dev` with no backend. Open `/diagram`.

**Steps:**

1. Choose **Formations**, then **Gun Trips Right**. Drag the H a few yards wider.
2. Choose **Save as formation**, type `Our Trips Wide`, and choose **Save offense**.

**Expected:**

- The note reads `Saved “Our Trips Wide” to My formations.`
- **My formations** shows its card above **Built-in**, with the H where it was dragged.
- Saving again as `our trips wide` reads `You already have an offense formation named “our trips wide”.`
- With only the five linemen on the field, saving reads `A formation needs 11 offense players. The field has 5.`

## Scenario 2 — Reuse, rename, match field, delete

**Steps:**

1. Choose **Gun Spread**, then the **Our Trips Wide** card.
2. Choose **Rename**, enter `Trips Wide`, **Save**.
3. Drag a player, then choose **Match field** on the card.
4. Choose **Delete**, then **Delete** again.

**Expected:**

- Step 1 replaces the offense only; a defense on the field stays.
- Step 2 reads `Renamed to “Trips Wide”.`; step 3 moves the card's player too.
- Step 4 reads `Deleted “Trips Wide”. Playbooks that use it keep it.` and the card leaves.
- Typing a saved formation's name in the search box sets it, like a built-in.

## Scenario 3 — Duplicate a built-in

**Steps:** On the **Defense** tab choose **Duplicate** under **4-3 Over**.

**Expected:** `4-3 Over (copy)` appears under My formations and is set on the field. A second duplicate is `4-3 Over (copy 2)`.

## Scenario 4 — Base alignment

**Preconditions:** A saved offense template (Scenario 1).

**Steps:** Open `/playbook?folder=base`. In **Base alignment**, pick the template under **My formations**. Choose **Draw**, then **Add play**.

**Expected:** The new play starts from the template's eleven players, not the blank line. With a backend, after deleting the template the dropdown still shows it as `(deleted)` and new plays still start from it.

## Scenario 5 — Facing a saved offense

**Preconditions:** A saved offense template.

**Steps:** Open `/plays/cover-3` and step the Facing strip to the end, or pick the template from its list.

**Expected:** The template appears after the library, tagged like the others (for Gun Trips Right moved wider: `3x1 (trips) · 11 personnel · gun`), and the defense re-aligns to it. Defense templates never appear here.

## Scenario 6 — Side rules (backend)

**Preconditions:** A team with an OC and a DC.

**Expected:**

- The OC sees **Save as formation** and the Rename / Match field / Delete / Duplicate actions on the Offense tab only; the DC on the Defense tab only. The head coach sees them on both.
- A DC who calls the API to save an offense template gets `permission denied` (42501). A player or another team's coach reads no templates.

## Scenario 7 — Phone width

**Steps:** At 390px wide, open the picker with saved formations and the save form open.

**Expected:** Cards stack one per row, the action links wrap under each card, and the page does not scroll sideways.
