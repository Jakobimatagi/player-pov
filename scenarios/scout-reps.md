# Scout reps

A scout rep is one play, one scout look and one of the play's own positions, with a spot where that player should end up and a tolerance circle (default 2 yards, 1 to 10). A coach assigns it as homework, a player taps their spot on the 2D board, and the server scores it. Issue #44.

Database checks are `supabase/tests/scout_reps.test.sql`. Run them on local Postgres only:

```bash
supabase db reset --local
supabase test db --local
```

The pure geometry and scoring (`src/reps/target.ts`) are covered by `tests/scout-reps.test.ts`.

Without a backend, `/plays/demo/reps`, `/homework/asg-wr` and `/?home=player` show demo data, so the screens can be opened without a database.

## How it is stored

- `scout_reps`: `play_id`, `look_id`, `slot`, `target_x`, `target_y` (yards from the ball at the snap, like the editor's legs: x downfield for the offense, y toward the offense's left), `tolerance_yd`, optional `note`. Staff only. Players never read this table.
- `assignments.rep_id`: a third assignment target. An assignment has exactly one of `playbook_id`, `package_id`, `rep_id`. `assignment_targets` carries `rep_id`.
- `rep_attempts`: one row per try, written only by `submit_rep_attempt`. Players read their own rows; any coach on the team reads the team's.
- `my_rep_homework(team)`: the player's reps. Target, tolerance and coaching note are null until the player has made one attempt.
- `rep_results(team)`: staff only. Per player per rep: attempts, first try distance and pass, best distance, passed.

## Scenario 1 — A coach makes a rep

**Preconditions:** A published offense play (Trips Flood) charted against Cover 3. The team has another defense look, Cover 2.

**Steps:**

1. On the play sheet, press **Scout reps**, then **New rep**.
2. Leave the look on Cover 3 (as charted). Pick H.
3. Check the target sits on the end of H's route.
4. Drag the target a few yards. Set the tolerance to 3 yards. Write a coaching point. Save.

**Expected:**

- The target starts at H's last waypoint compiled against the chosen look. Changing the look or position moves it, until the coach drags it.
- **Back to route end** puts it back.
- The rep shows in "Reps on this play" as "H vs Cover 3".
- Arrow keys move the target half a yard (Shift: 2 yards) when the board has focus.

## Scenario 2 — Who can make and assign a rep

**Preconditions:** Head coach, offensive coordinator (OC), defensive coordinator (DC), a coach with no side.

**Steps:**

1. As the DC, try to make a rep on the offense play, and to assign or delete an offense rep.
2. As the OC, make and assign one.

**Expected:**

- The DC is refused (`42501`) or changes nothing. The OC, the head coach and a coach with no side can. A rep's side is its play's side, the same rule as playbook assignments (`assignment_sides.md`).
- On the page, a coach who can't edit sees the rep and its results, but no Save, Assign or Delete.

## Scenario 3 — A rep can't be assigned until players can study it

**Steps:**

1. Make a rep on a draft play and try to assign it.
2. Make a rep against Cover 2 (not the play's own look) and assign it to one QB who has no scout package with Cover 2.
3. Assign the QBs a package with Cover 2, then assign the rep again.

**Expected:**

- Step 1: "Publish the play before assigning this rep." (`23514`)
- Step 2: "Those players can’t see this look yet. Assign them a scout package with it first." (`23514`)
- Step 3 works.
- The same rep can't be assigned to the same group or player twice.

## Scenario 4 — Player Home lists homework

**Preconditions:** Scenario 1's rep is assigned to the receivers, due in two days. Another rep is past due.

**Steps:**

1. Sign in as a receiver and open Player Home.

**Expected:**

- A **Homework** section lists each rep: play, look, the player's position, due date, and a state: Not started, Try again, Overdue (red) or Passed.
- Overdue reps come first, passed reps last. Overdue is only a visual state: nothing is sent.
- A teammate in another group sees none of these.

## Scenario 5 — A player answers

**Steps:**

1. Open the rep from Player Home.
2. Tap the board somewhere wrong. Submit.
3. Press **Try again**, tap inside the circle, submit.

**Expected:**

- Before submitting, the play shows against the rep's look with the player ringed and marked YOU and **their route hidden**. No target is drawn. **Watch in 3D first** links to `/watch/<playId>?look=<lookId>`.
- After a miss: "Not quite", the distance in yards, the right spot drawn with its tolerance circle, a line from the player's spot to it, the full route back on the board, and the coaching point.
- After a hit: "Got it".
- Every attempt is stored. Retries are unlimited (a cap of 100 a day per rep guards the table).

## Scenario 6 — The answer can't be read early

**Steps:**

1. As an assigned player who has not tried yet, `select * from scout_reps` and call `my_rep_homework`.
2. Insert into `rep_attempts` directly.
3. Call `submit_rep_attempt` on another player's assignment, or with a spot off the field.

**Expected:**

- Step 1: no rows from `scout_reps`; `my_rep_homework` has the rep with `target_x`, `target_y`, `tolerance_yd` and `note` all null.
- Step 2: refused (`42501`). The client never sends a distance or a pass; the server computes them.
- Step 3: refused (`42501` and `22023`).
- After one attempt, `my_rep_homework` returns the target.

## Scenario 7 — Coach results

**Steps:**

1. Open the rep on the Scout reps page.

**Expected:**

- Results list every assigned player: status (Passed, Missed, Not started, Overdue), first try (✓ or ✗ and distance), best distance, tries and due date.
- The summary shows how many tried, the pass rate and how many got it on the first try.
- Another team's coach sees no reps, attempts or results.

## Scenario 8 — Later changes

**Expected:**

- Unpublishing the play takes the rep off the player's list and stops attempts. The coach can still move the due date.
- Moving the target after players tried scores new attempts against the new spot; old attempts keep their stored result.
- Deleting a rep removes its assignments and attempts. Removing a player from the team deletes their attempts.
- The activity dashboard (`assignment_progress`) only counts playbook assignments, so rep assignments don't show there.
