# Scout looks in the 3D viewer

Every saved play can be watched in 3D against any scout look of the other side: the look it was charted against, a look from the team's scout looks, or a look from a scout package. The look is fixed per open and chosen before opening.

- **URL:** `/watch/<play id>?look=<look id>`. No `?look=` means the charted look (`plays.default_look_id`). Homework links (#44) use this exact shape.
- A look other than the charted one is compiled in the browser: the play's saved source against the look's current version (`compileSource`). The charted look runs the stored compiled play.
- Any look of the opposite side is playable against a play. A same-side look shows "This look is a defense, so pick an offense look" (or the reverse).
- A look id that isn't a uuid, doesn't exist, or that the viewer can't read shows **Couldn't open this look** with a reason. The viewer never falls back to the charted look.
- A play and look that don't compile together show **&lt;play&gt; doesn't compile against &lt;look&gt;**, with one group per player (`Look "Mike Fire" · LB #55 (mike)`) and the leg (`leg 1 "fire A gap": too fast: 23.3 yd/s…`).
- Players get looks only through what RLS already allows: the play's charted look, and the looks in a package assigned to them. No RLS change.

Screenshots: `docs/screenshots/scout-looks-viewer/`. Uses the local backend from the README (`coach@demo.local`, `player@demo.local`), with a saved offense play and a saved defense play, each with a charted look, plus at least one more scout look per side and a package assigned to the player.

## Scenario 1 — Coach picks a look on the play sheet

**Preconditions:** Signed in as the head coach. An offense play charted against Cover 3. The team has another defense look (Cover 2 Sink) in a package, and a draft look that doesn't fit the play.

**Steps:**

1. Open `/plays/<play id>`.
2. Open the **Against** picker beside **Watch in 3D**.
3. Pick **Cover 2 Sink** and click **Watch in 3D**.

**Expected:**

- The picker groups looks as **Charted with this play** (`Cover 3 (as charted)`), **Package: &lt;name&gt;**, then **Team scout looks**. Only defense looks are listed for an offense play.
- It starts on the charted look, and **Watch in 3D** links to `/watch/<play id>` until another look is picked; then it links to `/watch/<play id>?look=<look id>`.
- The viewer opens the play against Cover 2 Sink. The **Against** card in the viewer shows `Cover 2 Sink`.

## Scenario 2 — Switch looks in the viewer

**Preconditions:** Scenario 1.

**Steps:**

1. In the viewer, pick another look from **Against**.
2. Click **Back to plays**.

**Expected:**

- The URL changes to that look's `?look=` and the play recompiles against it. The camera starts fresh (nobody attached).
- **Back to plays** returns to the play sheet in one step: switching looks replaces the history entry.

## Scenario 3 — Defense-side play from a defender's POV

**Preconditions:** A saved defense play (Cover 3 Sky) charted against an offense look. The team has another offense look (Gun Trips Right).

**Steps:**

1. Open the play sheet, pick **Gun Trips Right**, click **Watch in 3D**.
2. Open **Watch as** and pick the Mike. Press 1 for POV.

**Expected:**

- **Against** lists offense looks only.
- **Watch as** lists both sides. POV looks out of the Mike's helmet at the offense.
- The rule card shows the Mike's 3 A's and 3 R's.

## Scenario 4 — Player opens a play at their own position (phone, 390 px)

**Preconditions:** Signed in as the player on a 390 px wide phone. The coach gave the player slot `h` on the offense play and `fs` on the defense play, and the package with Cover 2 Sink is assigned to the player.

**Steps:**

1. Open `/`, open the offense play.
2. Pick **Cover 2 Sink** from **Against** (the list shows the charted look and the package's looks only) and tap **Watch in 3D**.
3. Open **Watch as**, pick the QB, then tap **Back to my position**.
4. Open the defense play and **Watch in 3D**.

**Expected:**

- Nothing on the play sheet or the viewer scrolls sideways at 390 px.
- The viewer opens in POV through the H's helmet. **Watch as: H #11** and a pressed **Your position: H #11** button show; the rule card reads `Your job: H #11`.
- Step 3 moves to the QB, and **Back to my position** puts the camera back on the H.
- The defense play opens in the free safety's helmet, against its charted offense look.
- The player never sees the team's other scout looks.

## Scenario 5 — Unknown or unreadable look

**Steps:**

1. As the player, open `/watch/<play id>?look=<id of a look not in their packages>`.
2. Open `/watch/<play id>?look=cover-2`.

**Expected:**

- Step 1: **Couldn't open this look** and "This look isn't available. It may have been deleted, or it isn't in a package assigned to you."
- Step 2: **Couldn't open this look** and "“cover-2” is not a saved look id."
- Both have **Retry** and **Back to plays**. Nothing is drawn.

## Scenario 6 — Broken play/look pair

**Preconditions:** As the coach, a defense look where the Mike runs 14 yards in 0.6 s.

**Steps:**

1. Open the offense play against that look.

**Expected:** **Trips Flood doesn't compile against Mike Fire (draft)**, with a group `Look "Mike Fire (draft)" · LB #55 (mike)` and the line `leg 1 "fire A gap": too fast: 23.3 yd/s, the most a player can run is 11 yd/s. Give the leg more time.` A missing slot reads "needs 11 players on each side… A slot is missing." A route over the cap reads "has 12 legs, over the cap of 12 waypoints (11 legs at most). Remove a leg."

## Scenario 7 — Preview an unsaved drawing from the editor

**Preconditions:** Signed in as a coach, on `/diagram`.

**Steps:**

1. Add **Gun Trips Right** and **Cover 2** from the formation search.
2. Draw a route from H.
3. Leave **Our offense vs look** picked and click **Watch in 3D**.
4. Click **Back to editor**, choose **Our defense vs look**, and click **Watch in 3D** again.

**Expected:**

- The viewer opens `/watch/draft/<key>` with the drawing: our offense, the drawn defense as the scout look, and H's route.
- In step 4 the defense is ours and the drawn offense is the look; **Watch as** lists both sides.
- With only one side drawn, the other side is a stock look (Cover 2, or Gun Spread for a defense).
- More than 11 players on a side shows an error beside the button instead of opening the viewer. Fewer than 11 opens the viewer with the readable "A slot is missing" error.
