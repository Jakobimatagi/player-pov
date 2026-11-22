# Assigning playbooks

Staff assign a playbook folder to a position group (QB, RB, WR, TE, OL, DL, LB, DB, ST) or to one player, with an optional due date. A player sees an assigned folder, every folder inside it, and only the **published** plays in them (see `scenarios/play-calls.md`). Assigning follows the book's side: the head coach, that side's coordinator, or a coach with no side. Shared books and scout packages stay open to every coach. `supabase/tests/assignment_sides.test.sql` covers the database rules.

## Scenario 1 — Assign a folder

**Preconditions:** `npm run dev` with no backend, or a coach signed in. Open `/playbook`, then Our Playbooks.

**Steps:** On Base Offense choose **Assign**. Pick **Position group** › Defensive backs, set a due date, and choose **Assign**. Then **One player** › any player, and choose **Assign**.

**Expected:**

- The panel says how many plays inside are still drafts and stay hidden until published.
- The groups for the book's side come first in the list: DL, LB and DB for a defense book.
- Each assignment is listed with its due date, or "No due date", and a **Remove** button. Assigning the same group twice says "Already assigned."
- The folder row reads `Assigned: QB, DB, <player>`.
- A subfolder's panel lists its parent's assignments as "Through <parent>", without Remove.

## Scenario 2 — Coordinators

**Preconditions:** A backend, with the OC and DC named.

**Expected:** The OC has no **Assign** on defense books or their subfolders. The database refuses an OC's insert on a defense book (`42501`), and the OC can't remove the DC's assignments. Both coordinators can assign shared books.

## Scenario 3 — The player's side

**Preconditions:** A backend. Assign a defense book to the seeded player (`player@demo.local`).

**Expected:** While its plays are drafts, Player Home reads "No published plays for you yet." Once a play is published, Player Home lists it, and it opens on the read-only play sheet.
