# Player position lock

A coach assigns each player a position (a slot) on a saved play. The slot is a play player id such as `fs` or `cb1`, stored in `player_slots`. A player holds one slot per play. A slot can hold several players, like a depth chart.

When an assigned player opens the play, the viewer locks to their player. POV starts in their helmet. **Broadcast** and **Top-down** stay available and follow the same player. **Watch as**, hop keys, hop chips, swipes and tap-to-attach can't move to anyone else. Coaches are never locked.

A player with no slot on the play, or a slot the play doesn't have, watches freely and sees a note.

Uses the local backend from the README (`coach@demo.local`, `player@demo.local`).

## Scenario 1 — Coach assigns a position

**Preconditions:** Signed in as the coach. A saved play is in a playbook assigned to the player.

**Steps:**

1. Open `/watch/<play id>`.
2. Click **Assign players**.
3. On the `FS` row, choose the player from **+ Add**.

**Expected:**

- The player shows as a chip on the `FS` row.
- Adding the same player to `CB1` moves them off `FS`.
- Clicking the chip removes them.

## Scenario 2 — Player sees only their position

**Preconditions:** Scenario 1 done. Signed in as the player.

**Steps:**

1. Open `/`. Player Home lists the play with `Your position: FS`.
2. Open the play.
3. Press 2, then 3, then 1.
4. Press ←, →, ↑ and Escape. Tap another player.

**Expected:**

- The view opens in POV through the free safety's helmet.
- The camera bar shows `Your position: FS #…` instead of **Watch as**.
- Broadcast and Top-down frame the free safety.
- Nothing in step 4 changes the attached player.
- There is no **Assign players** button.

## Scenario 3 — Player without a position

**Preconditions:** The player has no slot on the play.

**Expected:** The play opens unlocked with the note "Your coach hasn't given you a position on this play yet." Player Home shows `No position assigned yet`.
