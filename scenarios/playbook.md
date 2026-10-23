# Playbook

The play list is `/playbook`. Staff can search, filter by playbook, rename, and delete. Edit play, New play, and Watch stay hidden until C5–C7. Watch is hidden because the viewer still only loads fixture ids, and a saved play's compiled jsonb is not the viewer's compiled scene. These checks use the anon key and row level security. The service role never ships. Edited in place: the opening line used to say players get Watch only.

## Scenario 1 — Staff list

**Preconditions:** A coach is signed in on a team that has plays. Local demo without Supabase shows Flood and Iso. `?roster=demo` is honored only when Supabase is not configured, or when the app is running in dev.

**Steps:**

1. Open `/playbook`.
2. Type `Iso` in Search plays.
3. Clear the search and choose the PB1 filter.

**Expected:**

- Each row has Rename and Delete. Edited in place: Watch, Edit play, and New play are hidden until C5–C7.
- While the list is still loading, the page says Loading… instead of No plays.
- The filter row is a group, not a tab list.
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

- The row shows the play name. Edited in place: Watch is hidden until C5–C7, along with Edit play, Rename, Delete, and New play.
- A rename or delete the database rejects shows the word forbidden.

## Scenario 4 — Narrow width

**Steps:**

1. Open `/playbook` at 360, 768, 1024, 1366, and 1920 pixels wide.

**Expected:**

- The page does not scroll sideways.
- Each row and each action is at least 44px tall.

## Scenario 5 — Restore an archived play

**Preconditions:** A coach is signed in and one play is archived. On the local demo, open `/playbook`. Mesh is the archived play. A player opens `/playbook?roster=player`.

**Steps:**

1. As staff, choose Archived.
2. Restore Mesh.
3. Open Archived again at 360 pixels wide and at 1920 pixels wide.
4. As a player, look for Archived.

**Expected:**

- Staff see Archived. The player view has no Archived tab.
- Restore puts Mesh back on the active list and shows Mesh restored.
- A restore the database rejects shows an error.
- Restore is at least 44px tall.
- The page does not scroll sideways at 360 or 1920.
