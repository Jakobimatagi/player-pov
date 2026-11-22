# Scout packs

A **scout pack** is one opponent's study material for one week, split into sections that coaches own. It is a folder tree (`supabase/migrations/20261202000000_scout_packs.sql`):

```
Opponents > <Team> > Week of <Monday> > Run Game, Pass Game, Special Teams, Tendencies
```

The week folder is the pack (`playbooks.pack_week`). It carries the side of the unit that studies the opponent, defense unless picked otherwise. A new week for the same opponent makes a new week folder next to the old one, so nothing is overwritten; the same opponent and week twice is refused. Sections are plain subfolders, so plays, Assign, Rename and Delete work as on any folder.

A section is delegated with a **scout task** (`scout_tasks`) to one coach or to a **coach room** (`memberships.coach_groups`: QB, RB, WR, TE, OL, DL, LB, DB, ST). The head coach sets rooms on `/team`. Tasks are staff only.

Who can do what:

| Action                                           | Who                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Make a pack                                      | Head coach, a coach with no side, or the coordinator of the pack's side        |
| Delegate a section                               | Anyone with side rights on it, or its owner (hands it on, one level at a time) |
| Edit plays, folders and rules in the section     | The assignee (every coach in an assigned room), whatever the section's side    |
| Set the status (Not started, In progress, Ready) | The assignee, any one coach in the room, or whoever delegated it               |
| Reassign or remove the task                      | Whoever delegated it, or a coach with side rights on the section               |
| Assign the section to players                    | Unchanged: head coach, that side's coordinator, or a coach with no side        |

An assignee cannot move, delete or change the side of the section folder they were given, and edits nothing outside it. A play stays its side's coordinator's if it is still filed in a folder the assignee can't edit. Removing a coach from the team, or making them a player, deletes the tasks assigned to them.

No backend: `/playbook` shows a demo pack at Opponents › Lincoln High › Week of Nov 23, and `/?home=coach` shows Coach Home for the demo DC (Coach Diaz, LB room).

## Scenario 1 — Make a scout pack

**Preconditions:** Signed in as the head coach or the DC, on `/playbook`.

**Steps:**

1. Click **New scout pack**.
2. Enter `Lincoln High`, pick any day in the week, leave **Studied by** on Defense and all four sections checked.
3. Click **Create pack**.

**Expected:**

- The page opens `All plays › Opponents › Lincoln High › Week of Nov 23` (the Monday of the picked week), tagged `Scouted opponent · Defense`, with `Scout pack for Lincoln High created: Week of Nov 23`.
- The **Pack board** and the folder list show Run Game, Pass Game, Special Teams and Tendencies, each `Not delegated`.
- Repeating with a day in the next week adds `Week of Nov 30` beside it in the same Lincoln High folder. Repeating with the same week shows `There is already a scout pack for Lincoln High that week`.
- Signed in as the OC, a Defense pack is refused; **Studied by** offers Offense or Shared only.

## Scenario 2 — Coach rooms

**Preconditions:** Signed in as the head coach, on `/team`.

**Steps:** Open `⋯` on a coach. Under **Coach rooms**, tap `DL` and `LB`.

**Expected:** Both turn red, the notice reads `<name> runs DL, LB.`, and the roster line shows `Coach · DL, LB`. Players have no Coach rooms control. Only the head coach sees it.

## Scenario 3 — Delegate a section

**Preconditions:** Scenario 1 and 2 done. On the pack.

**Steps:** On **Run Game**, click **Delegate**, pick `Defensive line room (…)`, a due date and a note, and click **Delegate**.

**Expected:** The Run Game card lists the room with `Due <date>`, the note and a status of `Not started`. Delegating Pass Game to one coach works the same way. A task cannot go to a player.

## Scenario 4 — Work as the assignee

**Preconditions:** Signed in as a coach in the DL room. Make them the OC (`Coordinator: Offense`) to see that side doesn't matter.

**Steps:**

1. Open `/`. Under **Your scout tasks**, find Run Game with the pack and due date. Click it.
2. Add a folder inside Run Game, add plays, and write position rules on them.
3. Set the status to **In progress**, then **Ready**.

**Expected:**

- Everything in step 2 saves, even though Run Game is a defense folder.
- Pass Game, Tendencies and other defense books stay read-only for this coach. The pack's Rename and Delete on Run Game itself: Rename works, Delete is refused (`only the coach who delegated this section can move or delete it`).
- The board shows `Ready · set by <name>`. Ready tasks leave the Coach Home list.
- The assignee has no Remove button on the task and cannot reassign it.

## Scenario 5 — Board and hand-off to players

**Preconditions:** Signed in as the head coach or DC. Some sections ready.

**Expected:**

- The **Pack board** shows each section with its owners, due dates and state: `Not delegated`, `Not started`, `In progress`, `Ready`, or `Published` once ready and every play in it is published. A section with two owners shows the least-done state. Overdue work is marked `Overdue`.
- A ready section shows **Assign to players**. It opens the existing assign panel. Drafts stay hidden from players until published.
- At 390px wide the board, the Delegate form, the Coach Home list and the Coach rooms control fit with no sideways scroll.

## Scenario 6 — Player view

**Preconditions:** A section is assigned to the QB group. Signed in as a QB.

**Expected:** The QB sees the assigned section and only its published plays, exactly as in `scenarios/assignments.md`. No pack board, no tasks, no Coach rooms. The database returns no `scout_tasks` rows to players or to other teams (`supabase/tests/scout_packs.test.sql`).
