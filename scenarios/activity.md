# Player activity and the coach dashboard

Coaches see how much each player studies: time on play sheets, time in the 3D viewer by camera, and **mental reps** (a play run in POV to the end). Reps are the headline number; time is supporting, because time alone is easy to inflate by leaving a tab open.

- **Capture** runs only for signed-in players, on a saved play: the play sheet (`/plays/:playId`) and the viewer (`/watch/:playId`). Staff, drafts and demo mode (no backend) capture nothing.
- **Coach dashboard** at `/team/activity` (Team > Activity, and the **Activity** card on Coach Home).
- **Player's own numbers** on Player Home, the same ones coaches see, with a line saying what is recorded.

## What counts

A sample is taken once a second (`src/activity/meter.ts`). A second counts only when all of these hold:

- the tab is visible (the same hidden-tab signal `src/ui/Scrubber.tsx` uses to pause playback);
- the player gave input (pointer, key, wheel, touch or scroll) in the last **60 seconds**;
- in the viewer, the play is running. Paused, scrubbing or the end frame count nothing.

Viewer time is split by camera: `pov`, `broadcast`, `topdown`. POV time also records the **slot watched** (the play player id looked through), so a coach sees whether a player studied their own job or a teammate's.

A **run** starts when Play is pressed at the first waypoint. It is **completed** when the play reaches its end having been actually watched (visible, active, running) for at least 80% of its length; scrubbing to the end is not a completed run. A completed run is credited to the camera it ended in. A completed run in POV is a **mental rep**; reps watched as the player's own assigned slot are shown as "own".

The page sends whole seconds every 30 seconds, when the tab hides, and on page hide or leaving the play. Fractions carry over. A dropped connection is retried on the next send; a refusal is not.

## Data

`activity_daily`: one row per team, player, day (the player's local day), play, kind and slot, upserted, never one row per heartbeat. Writes go only through `record_activity` (security definer): the caller is `auth.uid()`, they must be a player on the team who can view the play (published and assigned), seconds are capped at 120 per call and runs at 5, and the day must be within a day of the server's. Clients have no insert, update or delete grant.

Reads: every coach on the team reads the team's rows; a player reads only their own; other teams read nothing. `activity_summary` and `assignment_progress` do the rollups in the database (security invoker, so the same rules apply) so the browser never downloads the team's raw rows. Removing a member (`remove_member`, `delete_member_data`, or a direct delete) deletes their activity on that team.

Only in-app study is kept: no device, location or per-click data, and no third-party analytics. There is no CSV export and no season-end deletion job in v1.

**Rollout blocker:** the consent recorded at invite (`consent-v0-provisional`, `scenarios/team-management.md`) covers a parent, guardian or school approving the account. It says nothing about activity tracking. Whether this needs a new consent version and a re-consent step for existing players is **not decided**. Players can see their own numbers on Player Home, so nothing is hidden, but this must be resolved before it ships to real teams.

## Scenario 1 — POV time counts only while the play runs

**Preconditions:** Signed in as a player with a published, assigned play.

**Steps:**

1. Open `/watch/<playId>`. Pick POV. Press Play and watch to the end.
2. Wait 40 seconds, then switch to another tab for 30 seconds and come back.
3. Press Play, pause halfway, wait 30 seconds.

**Expected:** In `activity_daily` (or the coach dashboard) the day's `pov` row for that play and slot has about the play's length in seconds per run, one completed run for step 1, and no extra seconds for the paused or hidden time.

## Scenario 2 — Idle and background tabs add no time

**Steps:** Open `/plays/<playId>` as a player and leave it untouched for 3 minutes. Then move the mouse for 20 seconds.

**Expected:** The `playbook` row grows by about 80 seconds (60 seconds until idle, plus 20), not 200. A tab left in the background adds nothing.

## Scenario 3 — A scrub to the end is not a rep

**Steps:** In the viewer, press Play at the start, then drag the scrubber to the end.

**Expected:** `runs_started` goes up by one; `runs_completed` does not.

## Scenario 4 — Coach dashboard

**Preconditions:** Signed in as any coach.

**Steps:** Open `/team/activity`.

**Expected:**

- The week bar reads **This week** with arrows for earlier weeks (no future weeks).
- Tiles: **Players active** (`N / M`), **POV reps**, **Study time**, **Assignments done** (with "N overdue" in red when any are).
- **Players** lists every player on the roster, least active first (fewest POV reps, then least time). Columns: Player, Pos, POV reps (with "(N own)" when some were watched as another slot), POV time, Playbook time, Camera mix ("N% POV"), Plays opened, Assignments (`done / assigned`, "N overdue"), Last active.
- Filters: position group, side, assignment, and sort (least active, most active, name).

## Scenario 5 — Player detail

**Steps:** On `/team/activity`, click a player's name.

**Expected:** A panel above the list shows the player's week day by day (time bar and reps per day), each play opened with reps, time and "as QB" for the positions watched in POV, each assignment's status (Done, Not started, or `N / M repped`, with "overdue" in red), and a link to the depth chart. The close button hides it.

## Scenario 6 — Not started and overdue lists

**Steps:** Scroll to **Assignments** on `/team/activity`. Pick one assignment in the assignment filter.

**Expected:** Each playbook assignment shows its due date, `done / total`, a **Not started** list (assigned players with no activity on any of its published plays since it was assigned) and an **Overdue** list (past due and not done). An assignment is done when every published play in the folder and its subfolders was watched in POV to the end. Picking an assignment narrows both the player list and this list to it.

## Scenario 7 — Phone layout

**Steps:** Open `/team/activity` at 390px wide.

**Expected:** No sideways scroll. The filters wrap. The tiles are two across. The table becomes one card per player: name, position and last active, then POV reps, POV time and Playbook time, then assignments and camera mix. Tapping a card opens the player panel.

## Scenario 8 — Player sees their own numbers

**Preconditions:** Signed in as a player.

**Steps:** Open `/`.

**Expected:** Above the plays, **Your study this week** shows POV reps, study time, streak (days in a row, counting from today or yesterday) and assignments left (with "N overdue"). A note says what coaches see and that teammates can't. Nothing about teammates appears. At 390px the four figures sit two across with no sideways scroll.

## Scenario 9 — Privacy rules

**Expected (pgTAP, `supabase/tests/activity.test.sql`):** a player reads only their rows and their own summary and assignment progress; another team reads nothing; any coach reads the team; players cannot insert, update or delete rows; `record_activity` rejects other teams' plays, unassigned or draft plays, unknown kinds, a slot outside POV, negative seconds, far-off days, coaches and signed-out callers, and caps seconds at 120; removing a member deletes their rows.

## Scenario 10 — Demo mode

**Preconditions:** No `VITE_SUPABASE_URL`.

**Steps:** Open `/team/activity`.

**Expected:** A note reads "Demo data. With a team backend this shows your players' real study." over a 25-player demo week with two assignments (one overdue). Opening the viewer or a play sheet records nothing.
