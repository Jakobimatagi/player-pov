# Team management

A confirmed coach creates a team and becomes its head coach. Players arrive only by invite. The invite form asks for name, email, role, and position. A player invite also requires the consent box. There is no jersey field.

Local layout check without a backend: open http://127.0.0.1:5173/team . With the anon env vars set, `/team` requires sign-in.

## Scenario 0 — Create team

**Preconditions:** A confirmed coach with no membership is signed in.

**Steps:**

1. Open `/`.
2. Enter team name `Lone Peak Knights 2026`, a school, season `2026`, hash rule `NFHS`, and season end `2026-11-30`.
3. Click **Create team**.

**Expected:**

- The page title is `Create team` and the page also says `Ask your coach for an invite`.
- After a successful save the coach is **Head coach** of that team. The roster is empty of players.

## Scenario 1 — Invite a player

**Preconditions:** Signed in as the head coach.

**Steps:**

1. Open `/team` and click **+ Invite**.
2. Enter `Sam Lee`, `wr1@example.com`, role Player, position WR.
3. Leave the consent box unchecked, then tick it and click **Send invite**.
4. Open the email and set a password.

**Expected:**

- **Send invite** stays disabled until the box is ticked, with the text `Confirm consent to invite a player`.
- The consent statement is `I confirm this player's parent/guardian or school has consented to this account`.
- After accept, the roster shows Sam Lee, WR. A `consent_records` row names the coach, the time, and `consent-v0-provisional`.

## Scenario 2 — Already on the roster

**Steps:**

1. Invite an email that already has a membership on this team.

**Expected:**

- The message is `Already on the roster`.

## Scenario 3 — Revoke

**Steps:**

1. Revoke a pending invite from its **⋯** menu.
2. Open the old link.

**Expected:**

- The link shows `This invite is no longer valid`.

## Scenario 4 — Change position

**Steps:**

1. As head coach, change a player from WR to TE.
2. Reload as that player.

**Expected:**

- The roster shows TE. Group assignments follow on the next load.

## Scenario 5 — Remove a player

**Steps:**

1. Remove the player from the **⋯** menu.

**Expected:**

- Their next navigation says they no longer have access and shows no plays.

## Scenario 6 — Last head coach

**Steps:**

1. As the only head coach, try to remove or demote yourself.

**Expected:**

- The action is refused. The message includes `cannot remove the last head coach`.

## Scenario 7 — Assistant coach

**Preconditions:** Signed in as a coach, not a head coach.

**Steps:**

1. Open `/team`.

**Expected:**

- The roster is visible.
- **+ Invite** and remove are absent.

## Scenario 8 — Player roster

**Preconditions:** Signed in as a player.

**Steps:**

1. Open `/team`.

**Expected:**

- Teammate names and positions are visible.
- No email addresses, and no **+ Invite** or remove.

## Scenario 9 — Consent required

**Steps:**

1. Open **+ Invite**, choose Player, and leave the consent box unchecked.

**Expected:**

- **Send invite** is disabled.
- The helper text is `Confirm consent to invite a player`.

## Scenario 10 — Delete player data

**Preconditions:** The player was removed and has watch history. Signed in as head coach.

**Steps:**

1. Choose **Delete player data** from the removed player's **⋯** menu.

**Expected:**

- Their watch rows for this team are gone.
- If they had no other team, they cannot sign in.
