# Formations and "vs" exceptions

A defense play is studied against the offenses it will see. The play sheet's **Facing** strip picks a formation, the board re-aligns the defense to it, and each position's card shows the answers against it.

## Pieces

- **Formation library** (`src/formations/library.ts`): Gun Spread (2x2, 11), Gun Trips Right (3x1, 11), Gun Bunch Right (3x1, 11), Empty 3x2 (empty, 10), Ace Twins (2x2, 12), 12 Trips Right (3x1, 12), Heavy (3x1, 13) and I-Form Pro (2x1, 21). The team's own charted offensive looks appear after these.
- **Tags** (`detectTags`): personnel (backs then tight ends), receiver structure, backfield and strength are read from the alignment. A charted look gets tagged the same way, so nobody tags by hand.
- **Anchored defenders**: a defense play's player can carry `anchor` (`strong#1`, `strong#2`, `weak#1`, `weak#2`, `strong`, `weak` or `ball`). Depth is yards from the line of scrimmage. With any anchor but `ball`, sideways yards and drops mean _outside_, so the same call mirrors when the offense flips its strength. Plays without anchors compile exactly as before.
- **Starter defense**: Generate playbook offers **Base 4-3 Coverages** (Cover 3 Sky, Cover 2, Cover 1 Robber), all anchored. A DC sees it; offense books stay hidden from them.
- **Exceptions** (`position_rule_variants`): per position, at one of three scopes. Per answer, the most specific one wins: this formation, then its structure, then its personnel, then the base rule. A blank answer inherits, so an exception can't blank anything, and the publish gate on the base rule is untouched. Write access matches position rules. `supabase/tests/rule_variants.test.sql` covers the database rules.

## Scenario 1 — The defense re-aligns

**Preconditions:** `npm run dev` with no backend. Open `/plays/cover-3`.

**Steps:** Use ‹ and › on the Facing strip, or the list, to go from Gun Spread to Gun Trips Right, then to a mirrored look.

**Expected:** The strip shows `3x1 (trips) · 11 personnel · gun`. Sam and the strong safety move to the trips side, the Will stays weak, and the corners stay over the widest receivers. The page does not scroll sideways at 390px.

## Scenario 2 — Coach writes an exception

**Steps:** Facing Gun Trips Right, pick FS. The tabs read **Every formation**, **vs Gun Trips Right**, **vs 3x1 (trips)** and **vs 11 personnel**. Open **vs 3x1 (trips)**, enter Alignment `10 yards, over #3`, and choose **Save exception**.

**Expected:**

- Each field shows `Otherwise: …`, which is what it inherits, and is struck through once overridden.
- The tab gets a dot, and the FS row in the list reads `1 vs this look`.
- Facing 12 Trips Right (also 3x1), the same exception applies. Facing Gun Spread, it does not.
- Clearing every field and saving removes the exception.
- With a backend, the exception is still there after a reload. The OC sees the defense tabs read-only.

## Scenario 3 — Player studies the week

**Preconditions:** Open `/plays/cover-3?roster=player` (the demo player is the FS). With a backend, a player assigned a published defense play.

**Expected:** The card reads `Your job: FS #8`. Facing Gun Trips Right, Alignment, Read and React carry a `vs 3x1` tag and the rest come from the base rule. Facing Gun Spread, nothing is tagged. Nothing is editable.
