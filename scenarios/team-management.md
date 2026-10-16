# Team management

A confirmed coach with no membership creates a team and becomes its owner and head coach. The profile name comes from the login email. `user_metadata` is ignored. Everyone else joins only through `public.accept_invite`. The coach invites by email and gets a copyable link. No email is sent.

Open http://127.0.0.1:5173/team . With the anon env vars unset, `/` stays the viewer. With them set, `/team` requires sign-in.

## Scenario 0 — Create team

**Preconditions:** A confirmed coach with no membership is signed in.

**Steps:**

1. Open `/`.
2. Enter team name `Lone Peak Knights 2026`, a school, season `2026`, hash rule `NFHS`, and season end `2026-11-30`.
3. Click **Create team**.

**Expected:**

- The page title is `Create team` and the page also says `Ask your coach for an invite`.
- After a successful save the address is `/team`. The coach is **Head coach** of that team. The roster shows the coach and no players.

## Scenario 1 — Invite a player

**Preconditions:** Signed in as the head coach on `/team`.

**Steps:**

1. Enter `Sam Lee`, `wr1@example.com`, role Player, position WR.
2. Leave the consent box unchecked, then tick it and click **Create link**.

**Expected:**

- **Create link** stays disabled until the box is ticked. The helper text is `Confirm consent to invite a player`.
- The consent statement is `I confirm this player's parent/guardian or school has consented to this account`.
- The page shows an **Invite link** whose path is `/accept-invite?token=` plus 64 hex characters, and a **Copy link** button. No mail is sent.
- The database stores only the sha256 of that token. A `consent_records` row names the coach, `head_coach`, and `consent-v0-provisional`.

## Scenario 2 — Already on the roster

**Steps:**

1. Invite an email that already has a membership on this team.

**Expected:**

- The message is `Already on the roster`.

## Scenario 3 — Revoke

**Steps:**

1. Click **Revoke** on an open invite.
2. Open the old link.

**Expected:**

- The invite leaves the open list.
- The link shows `This invite is no longer valid. Ask your coach for a new one, or log in.`

## Scenario 4 — Change position

**Steps:**

1. As head coach, change a player from WR to TE and click **Save**.
2. Reload as that player.

**Expected:**

- The roster shows TE.

## Scenario 5 — Owner and head coaches

**Steps:**

1. As a head coach who is not the owner, try to invite or promote a head coach.
2. As the owner, invite a head coach and copy the link.

**Expected:**

- The co-head does not get a Head coach option. A direct attempt is refused with `only the team owner can add a head coach` or `only the team owner can promote a head coach`.
- The owner's link is the only join path. Accepting it calls `public.accept_invite`.

## Scenario 6 — Assistant coach

**Preconditions:** Signed in as a coach, not a head coach.

**Steps:**

1. Open `/team`.

**Expected:**

- The roster is visible.
- **Create link** and **Revoke** are absent.

## Scenario 7 — Player roster

**Preconditions:** Signed in as a player.

**Steps:**

1. Open `/team`.

**Expected:**

- Teammate names, positions, and roles are visible.
- No email addresses, and no **Create link** or **Revoke**.

## Scenario 8 — Widths

**Steps:**

1. Open `/team` as a head coach at 360, 768, 1024, 1366, and 1920.

**Expected:**

- The page does not scroll sideways.
- **Create link**, **Copy link**, **Revoke**, **Save**, the consent checkbox, and the account button are at least 44px.
- At 360 the roster and invite fields stack. From 768 the roster row lines up name, role, and position.
