# Playbook

The play list is `/playbook`. Staff can search, browse nested folders, rename, and delete. Edited in place: it used to say filter by playbook; folders replaced the playbook filter row. Edit play, New play, and Watch stay hidden until C5–C7. Watch is hidden because the viewer still only loads fixture ids, and a saved play's compiled jsonb is not the viewer's compiled scene. These checks use the anon key and row level security. The service role never ships. Edited in place: the opening line used to say players get Watch only.

## Scenario 1 — Staff list

**Preconditions:** A coach is signed in on a team that has plays. Local demo without Supabase shows Flood and Iso. `?roster=demo` is honored only when Supabase is not configured, or when the app is running in dev.

**Steps:**

1. Open `/playbook`.
2. Type `Iso` in Search plays.
3. Clear the search and open Our Playbooks › Base Offense. Edited in place: this step used to choose the PB1 filter.

**Expected:**

- Each row has Rename and Delete. Edited in place: Watch, Edit play, and New play are hidden until C5–C7.
- While the list is still loading, the page says Loading… instead of No plays.
- The Folders / Archived row is a group, not a tab list.
- The search leaves Iso.
- Base Offense lists Flood. Edited in place: this used to say PB1 leaves the plays in that playbook.

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

## Scenario 6 — Nested folders for playbooks and opponents

**Preconditions:** A coach is signed in. Local demo without Supabase starts with Our Playbooks › Base Offense (Flood) and Opponents › Lincoln High. Iso is not in a folder.

**Steps:**

1. Open `/playbook`.
2. Open Opponents, choose New folder, type `Central`, and create it.
3. Open Central, then use the breadcrumb to go back to All plays.
4. Rename Central, then Delete it and confirm.

**Expected:**

- All plays lists the top-level folders, then Iso under Not in a folder.
- An opponent folder has an amber icon and says Opponent · N plays. The count includes plays in its subfolders.
- New folder in Opponents starts with Scouted opponent selected. Create shows Central created.
- The breadcrumb reads All plays › Opponents › Central, and each earlier part is a link. The URL carries `?folder=<id>`, so Back and a reload return to the same folder.
- Delete asks first and says plays stay in All plays. After it, Central is gone and its plays are still listed.
- Folders nest at most 8 deep. At the eighth level New folder is hidden.

## Scenario 7 — Add plays to a folder

**Preconditions:** Scenario 6. Open Opponents › Lincoln High.

**Steps:**

1. Choose Add plays. Existing plays is selected. Tick Iso and choose Add play.
2. Choose Add plays › Blank play, type `Lincoln Trips Sink`, and choose Create play.
3. Choose Add plays › Upload play file and pick `fixtures/trips-flood.source.json` and any non-play `.json` file together.
4. On Iso, choose Remove from folder.

**Expected:**

- Step 1 shows Added 1 play and Iso is listed in Lincoln High. Iso stays in All plays search.
- Step 2 shows Lincoln Trips Sink created. The play is a Gun Trips Right offense with no routes.
- Step 3 adds Trips Right Flood and shows Uploaded 1 play. The other file shows `<name>: That file is not a play source or a play file`.
- Step 4 takes Iso out of Lincoln High only. Iso is not archived.
- At All plays, Add plays offers Upload play file and Blank play only. Those plays land in Not in a folder.

## Scenario 8 — Assigned folders for players

**Preconditions:** Local database. `supabase/tests/playbook_folders.test.sql` covers these rules.

**Steps:**

1. Assign a top-level folder to a position group, with a play two folders below it.
2. Sign in as a player in that group and open `/playbook`.
3. As a coach, archive the middle folder.

**Expected:**

- The player sees the assigned folder, every subfolder under it, and the nested play. Unassigned folders do not show.
- After step 3 the player loses the middle folder and everything under it. Staff still see it under the database's archived rows.
- A folder cannot sit under another team's folder, under itself, or under its own subfolder (`23514`).
