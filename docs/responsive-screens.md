# Responsive screens that are not in the engine yet

These are scenarios 5–15. They used to sit in `scenarios/responsive.md` and keep those numbers so later pull requests can cite them without renumbering. The engine viewer checks scenarios 1–4 in `scenarios/responsive.md`. Widths, the 44px target, and the type scale are defined there.

## Scenario 5 — Login

**Preconditions:** The login route is in the build. Mockups: `login-phone.jpg`, `login-tablet.jpg`. Desktop card is the charcoal login mock.

**Steps:**

1. Open the login route at each width.

**Expected:**

- 1920 and 1366: a centered card about 560px wide on charcoal. Email, password, full-width **Log in**, and **Forgot password?** underneath.
- 1024 and 768: the same card, about 520px wide, still centered.
- 360, matching `login-phone.jpg`: no card frame. Wordmark at the top (`POV` white, `Playbook` red). Fields full width. **Log in** is full width and 52px tall. **Forgot password?** is a 44px text link. The invite hint sits at the bottom.
- Inputs are at least 48px tall with 16px type. No horizontal scroll.

## Scenario 6 — Accept invite

**Preconditions:** An invite link is open.

**Steps:**

1. Open an accept-invite page at each width, then an expired invite.

**Expected:**

- 1920 and 1024: red invite banner and a centered card. Password and confirm sit side by side.
- 768: the same card, with password and confirm stacked.
- 360: the banner is two lines. Every field is stacked. The invited email is read-only text. **Create account** sits at the bottom when the keyboard is closed.
- An expired or used invite uses the login card pattern from scenario 5 at that width.

## Scenario 7 — Password reset

**Steps:**

1. Open the forgot-password route at each width and submit an address.

**Expected:**

- The layout matches Login (scenario 5) at that width.
- The form is replaced in place by `If that email has an account, a link is on its way`.

## Scenario 8 — Team roster

**Preconditions:** Signed in as a coach. Mockups: `team-roster-phone.jpg`, `team-roster-tablet.jpg`.

**Steps:**

1. Open `/team` at each width.

**Expected:**

- 1920 and 1366: sidebar plus a table with Name, Role, Position, Status, and a `⋯` button on every row. **+ Invite** is in the header.
- 1024, matching `team-roster-tablet.jpg`: left nav with labels, the same table, `⋯` on every row.
- 768: hamburger opens a drawer. The table drops Status into a dot beside the name.
- 360, matching `team-roster-phone.jpg`: bottom tab bar. Segmented filter All / Coaches / Players / Pending. Each person is a row (name, position badge, role, status dot, `⋯`). **+ Invite** is a header button and opens a bottom sheet.
- No horizontal scroll. Every `⋯`, tab, and filter is at least 44×44.

## Scenario 9 — Play editor

**Preconditions:** Signed in as a coach. Mockups: `play-editor-phone.jpg`, `play-editor-tablet.jpg`.

**Steps:**

1. Open a play in the editor at each width.

**Expected:**

- 1920 and 1366: tools column, field, properties column.
- 1024, matching `play-editor-tablet.jpg`: coach nav is hidden. The top bar says Play Editor and goes back to Playbooks. A vertical tool rail uses 56px buttons (Select, Player, Route, Timing, Delete). Undo and redo are 44px buttons above the field. The properties panel is about 260px and contains **Save draft** and **Publish**.
- 768: the tool rail moves above the field. Properties sit in a collapsible bottom panel.
- 360, matching `play-editor-phone.jpg`: read-only. Play name, formation, status, a full-width diagram, **Watch** when the play is published, and the notice `Edit on a tablet or Chromebook.` No tools and no drag handles. A draft says `Draft — not published.`
- No horizontal scroll.

## Scenario 10 — Playbooks

**Steps:**

1. Open `/playbooks` at each width.

**Expected:**

- 1920 and 1366: a 3-up card grid.
- 1024: 3-up, smaller cards. 768: 2-up.
- 360: one column. Each card shows the name, play count, who it is assigned to, and `⋯`. **+ New playbook** is in the header. Assign is a full-screen sheet with checkbox rows at least 48px tall.
- No horizontal scroll.

## Scenario 11 — Scout packages

**Steps:**

1. Open `/scout` at each width.

**Expected:**

- 1920, 1366, and 1024: a table of Package, Looks, Updated, and `⋯`.
- 768: the same table, with Updated under the name.
- 360: a card list. Opponent and week stay in a sticky header.
- No horizontal scroll.

## Scenario 12 — Player Home

**Preconditions:** Signed in as a player. Mockups: `player-home-phone.jpg`, `player-home-tablet.jpg`.

**Steps:**

1. Open `/` as a player at each width. Repeat with no assigned plays.

**Expected:**

- 1920: greeting, position badge, scout-look picker at the top right, plays as a 2- or 3-up card grid with large **Watch** buttons.
- 1024, matching `player-home-tablet.jpg`: 2-up cards. The look picker stays in the top bar. There is no sidebar.
- 768: one column of wide cards.
- 360, matching `player-home-phone.jpg`: greeting and badge, the look picker full width underneath, then a stacked list (thumbnail, name, formation and look, a full-width **Watch** at least 52px). A progress line such as `2 of 3 watched this week` sits at the top.
- The empty state is centered at every width. No horizontal scroll. No coach tab bar.

## Scenario 13 — Homework dashboard

**Preconditions:** Signed in as a coach. Mockups: `homework-dashboard-phone.jpg`, `homework-dashboard-tablet.jpg`.

**Steps:**

1. Open `/dashboard` at each width. Repeat with no watch data.

**Expected:**

- 1920 and 1366: filters plus a table (Player, Position, Plays watched, Avg time, Completion %, Last watched).
- 1024, matching `homework-dashboard-tablet.jpg`: the same table. Three filters sit on one row.
- 768: Avg time is dropped. Filters sit two per row.
- 360, matching `homework-dashboard-phone.jpg`: cards, not a table. **Filters (3)** opens a bottom sheet. A summary strip shows Done and Behind counts. Each card has the name, position badge, Done or Behind, a completion bar with a percent, plays watched, and last watched. Sort is Behind first. The bottom tab bar is present.
- The empty state is centered at every width. No horizontal scroll.

## Scenario 14 — Viewer and scout look

**Preconditions:** A published play with at least two looks. Mockups: `viewer-scout-look-phone.jpg`, `viewer-scout-look-tablet.jpg`.

**Steps:**

1. Open `/watch/:playId` at each width, including 360×800 in landscape (800×360).
2. Open the look picker.

**Expected:**

- The canvas is full-bleed at every width.
- 1920 and 1366: play title at the top left, look picker at the top right, transport bar along the bottom.
- 1024, matching `viewer-scout-look-tablet.jpg`: the same arrangement. Transport buttons are 48px. The picker lists looks with the current one checked.
- 768: the transport bar is two rows (play controls, then camera and hop).
- 360 portrait, matching `viewer-scout-look-phone.jpg`: top bar is back, play name, and a **Look** chip. The chip opens a bottom sheet of looks, each row 48px, current look checked. The transport bar has play/pause, a 44px scrubber hit area, and speed, then a second row for POV, Broadcast, Top, and Hop.
- 360 landscape: chrome hides after 3 seconds and returns on tap.
- The facemask bars are about 60% of the desktop thickness on the phone.
- WebGL fallback and play-error screens follow the login card pattern from scenario 5.
- No horizontal scroll.

## Scenario 15 — Account menu

**Steps:**

1. Open the account control on a signed-in screen at 360 and at 1024.

**Expected:**

- The avatar is at least 44×44 and lives in the top bar.
- 1024 and up: a dropdown shows name, role, team, **Change password**, and **Sign out**.
- 360: a bottom sheet shows the same items. **Sign out** is a full-width row in red text.
- Sign out is reachable in two taps or fewer.
