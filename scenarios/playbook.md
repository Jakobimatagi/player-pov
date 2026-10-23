# Playbook

The play list is `/playbook`. Staff can search, filter by playbook, rename, and delete. Players get Watch only. Edit play and New play go to editor routes that are built in a later step. These checks use the anon key and row level security. The service role never ships.

## Scenario 1 — Staff list

**Preconditions:** A coach is signed in on a team that has plays. Local demo without Supabase shows Flood and Iso.

**Steps:**

1. Open `/playbook`.
2. Type `Iso` in Search plays.
3. Clear the search and choose the PB1 filter.

**Expected:**

- Each row has Watch, Edit play, Rename, and Delete.
- New play is on the page.
- The search leaves Iso.
- PB1 leaves the plays in that playbook.

## Scenario 2 — Rename and delete

**Preconditions:** Scenario 1, on a seeded team.

**Steps:**

1. Rename Flood.
2. Delete that play.

**Expected:**

- The list shows the new name.
- After delete the play is gone. The row is archived, not removed from the database.

## Scenario 3 — Player view

**Preconditions:** A player who is assigned one play. Or open `/playbook?roster=player` on the local demo.

**Steps:**

1. Open the playbook as that player.

**Expected:**

- Watch is on the row.
- Edit play, Rename, Delete, and New play are absent.

## Scenario 4 — Narrow width

**Steps:**

1. Open `/playbook` at 360, 768, 1024, 1366, and 1920 pixels wide.

**Expected:**

- The page does not scroll sideways.
- Each row and each action is at least 44px tall.
