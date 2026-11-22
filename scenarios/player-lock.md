# Player position lock

A coach assigns each player a position (a slot) on a saved play. The slot is a play player id such as `fs` or `cb1`, stored in `player_slots`. A player holds one slot per play. A slot can hold several players, like a depth chart.

When an assigned player opens the play (from Player Home, homework or the play sheet), the viewer starts on their player: POV starts in their helmet. Since #45 this is a starting point, not a lock. **Watch as**, hop keys, hop chips and tap-to-attach still move to anyone, and **Back to my position** returns to their slot. Coaches always open free. The same holds whichever scout look the play is opened against (`?look=`, see `scenarios/scout-looks-viewer.md`).

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

## Scenario 2 — Player starts at their position

**Preconditions:** Scenario 1 done. Signed in as the player.

**Steps:**

1. Open `/`. Player Home lists the play with `Your position: FS`.
2. Open the play, then **Watch in 3D**.
3. Press 2, then 3, then 1.
4. Pick the Mike from **Watch as**.
5. Click **Back to my position**.

**Expected:**

- The view opens in POV through the free safety's helmet.
- The camera bar shows **Watch as: FS #…** and a pressed `Your position: FS #…` button. The rule card reads `Your job: FS #…`.
- Broadcast and Top-down frame the free safety.
- Step 4 moves the camera to the Mike; the button now reads **Back to my position**.
- Step 5 puts the camera back in the free safety's helmet.
- There is no **Assign players** button.

## Scenario 3 — Player without a position

**Preconditions:** The player has no slot on the play.

**Expected:** The play opens unlocked with the note "Your coach hasn't given you a position on this play yet." Player Home shows `No position assigned yet`.
