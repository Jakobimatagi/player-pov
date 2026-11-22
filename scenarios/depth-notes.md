# Depth chart notes

Coaches write notes on a player from the depth chart or the roster sheet. Notes read as a thread (author and date on each), so the reasoning behind a depth spot is kept instead of overwritten. The player reads their own depth spots and the notes a coach chose to share on a **My depth chart** card on Player Home.

Rules enforced by the database (`depth_notes`, `supabase/migrations/20261206000000_depth_notes.sql`):

- Every staff member on the team reads every note and can write a note on any player. This is feedback, not a depth change, so the side rules for `set_depth` do not apply.
- Editing, sharing or unsharing, and deleting are limited to the note's author or the head coach.
- A note is **Private (staff only)** until a coach turns on **Share with player**. The toggle is off by default.
- Players read nothing in `depth_notes`, `depth_chart` or `roster_players`. `my_depth_spots` and `my_depth_notes` return only their own spots and their own shared notes. Other teams' coaches read nothing.
- Text only, 1 to 1000 characters. No notifications and no parent access.
- The roster sheet's existing staff notes column (`roster_players.notes`) is unchanged and stays private. It is labelled **Private (staff only)**.
- A player with no account keeps coach-only notes. When the coach links the row to the account or merges the typed-in row into the account holder's row, the notes move with it.
- Removing a membership removes the roster row, its depth spots and its notes.

With no backend, `/team/depth` and `/team/roster` show demo notes, and you act as the head coach.

## Scenario 1 — Add a note from the depth chart

**Steps:**

1. Open `/team/depth` and click the **LT** card.
2. Under the starter, click the notes control (it shows the count, for example `3 notes · 2 shared`, and a preview of the latest note).
3. Type a note, leave **Share with player** off, and click **Add note**.

**Expected:** The thread opens under the player with the oldest note first. Each note shows the author, the date, the position (`LT`) when the note is about that position, and a **Shared with player** or **Private (staff only)** label. The new note is added at the bottom labelled **Private (staff only)**, and the count goes up by one.

## Scenario 2 — Share warning

**Steps:** In the add form, turn on **Share with player**.

**Expected:** The form shows `The player can read this.` before saving. With the toggle off it says `Private: only coaches can read this.` instead. Over 1000 characters can't be typed, and a blank note shows `Write a note first`.

## Scenario 3 — Edit, share and delete

**Steps:** On a note you wrote, click **Edit**, change the text and save. Click **Share with player**, then **Make private**. Click **Delete**, then confirm.

**Expected:** Each change saves and the label updates. As another coach (not the head coach), notes you didn't write show no **Edit**, **Share** or **Delete** buttons, and the database refuses the change if it is attempted. The head coach can change any note.

## Scenario 4 — Roster sheet labels

**Steps:** Open `/team/roster`.

**Expected:** The staff notes column is headed **Private (staff only)**. Next to it, **Depth notes** shows `Shared with player (N)` or `Not shared`, plus the notes control. Clicking it opens the same thread above the table.

## Scenario 5 — Player reads their notes

**Preconditions:** A player with an account is 2nd at LT, has one shared note and one private note.

**Steps:** Sign in as the player and open Player Home.

**Expected:** **My depth chart** shows `LT, 2nd string of N` and only the shared note, with the coach's name and date. The private note and other players' spots are not shown. Notes shared since the last visit show a `1 new note` badge and a **New** tag; after a reload the badge is gone. Works at 390px wide with no sideways scroll.

## Scenario 6 — Merge brings notes along

**Steps:** Write a note on a typed-in player (no account). After they accept an invite, merge the typed-in row into their account row on `/team/roster` and share the note.

**Expected:** The note now sits under the account holder, with the same author and date. The player sees it on Player Home.

## Scenario 7 — From the activity dashboard

**Steps:** On `/team/activity`, open a player's detail and click **Depth chart and notes**.

**Expected:** `/team/depth?user=<id>` opens a panel for that player with their spots (for example `LT, Starter`) and their notes thread.
