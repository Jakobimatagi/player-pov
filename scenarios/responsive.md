# Responsive layout

Every screen is mobile-first and has to work at five widths. Compare each screen with its mockup at the width that mockup was drawn for, and with the layout rules below at the other widths. A pull request that adds or changes a screen must pass every scenario whose screen is reachable in that build, and it must cite this file plus the scenario numbers.

Screens that are not routed yet are the contract for the pull request that adds them. They are not failures of an earlier pull request.

## Widths

Set the viewport, then reload. Use height 800 unless a row names a different height.

| Check            | Viewport  | Breakpoint           |
| ---------------- | --------- | -------------------- |
| Phone            | 360×800   | under 768            |
| Tablet portrait  | 768×1024  | 768–1023, portrait   |
| Tablet landscape | 1024×768  | 1024–1279, landscape |
| Chromebook       | 1366×768  | 1280–1919            |
| Desktop          | 1920×1080 | 1920 and up          |

Phone mockups (`*-phone.jpg`) are drawn at 390px. Check them at 360. Tablet mockups (`*-tablet.jpg`) are 1024×768 landscape. Desktop mocks in the design set are the 1920 baseline.

## What to measure on every screen

1. `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. The page does not scroll sideways.
2. Every `button`, `a`, `input`, `select`, and `[role="button"]` has a border box at least 44×44 CSS pixels. A scrubber track may be drawn thin; its hit area is still 44px tall.
3. Visible text is at least 14px. Body type is 16px on the phone, 17px from 768, 18px from 1280, and 22px from 1920.
4. Page padding is 16 / 20 / 24 / 48 px (phone / tablet / laptop / desktop).
5. Nothing that matters is hover-only. Row actions are a visible `⋯` button.

Coach navigation, once those screens exist: bottom tab bar on the phone (Team, Playbooks, Plays, Scout, Homework, 64px, icon and label); hamburger and drawer on tablet portrait; persistent left nav from tablet landscape up (200px at 1024, 220px at 1366). Player screens have no sidebar. The account menu is a 44px avatar in the top bar, and Sign out is at most two taps away.

## Scenario 1 — Film viewer shell

**Preconditions:** Dev server running. WebGL available. This is the engine viewer, before the scout-look chrome in scenario 14.

**Steps:**

1. Open http://127.0.0.1:5173/ at each width in the table.

**Expected:**

- The canvas fills the viewport. The page does not scroll sideways.
- **Play**, each speed, **Show routes** / **Hide routes**, the time range, and the camera buttons are at least 44px in both axes.
- The camera buttons and the scrubber wrap inside the viewport on the phone.
- At 360 the camera words are `POV`, `Broad`, and `Top`. From 768 up they are `POV`, `Broadcast`, and `Top-down`. The accessible names stay `POV`, `Broadcast`, and `Top-down` at every width.
- **Watch as** sits in the camera bar and is at least 44×44. At 360 it wraps onto its own row. In POV, **Hold look** sits on that row beside it, and **Look with phone** does too when device orientation exists. Opening the list does not make the page scroll sideways. Option rows are at least 44px tall. See `scenarios/pov-picker.md` and `scenarios/gyro-look.md`.
- Speed chips include **0.25×**. See `scenarios/playback-rates.md`.
- Body text is 16px at 360, 17px at 768 and 1024, 18px at 1366, and 22px at 1920.
- On a fine pointer the hop chips are absent, so these five widths stay clear of them. On a coarse pointer, once a player is attached, **Hop left** and **Hop right** sit beside the scrubber and each is at least 44×44.

## Scenario 2 — Loading

**Steps:**

1. In DevTools, throttle the network to Slow 3G and reload http://127.0.0.1:5173/ at each width.

**Expected:**

- The words `Loading play…` are on screen at 16px or larger.
- The page does not scroll sideways.

## Scenario 3 — Load error

**Steps:**

1. Open http://127.0.0.1:5173/?play=/plays/missing.json at each width.

**Expected:**

- The heading `Couldn't load this play` and the URL wrap inside the viewport.
- **Retry** is at least 44×44.
- There is no horizontal scroll.
- Text is at least 14px, and body type follows the scale in the measurement list.

## Scenario 4 — WebGL fallback

**Steps:**

1. Open http://127.0.0.1:5173/?webgl=0 at each width.

**Expected:**

- The heading is `This device or browser can't show 3D`.
- At 360 the diagram stacks under the text. From 768 up, the text and the diagram sit side by side.
- **Reload** is at least 44×44.
- The diagram SVG stays inside the viewport. There is no horizontal scroll.

## Scenario 5 — Login

**Preconditions:** The login route is in the build.

**Steps:**

1. Open http://127.0.0.1:5173/login at each width.

**Expected:**

- 1920 and 1366: a centered card about 560px wide. Email, password, full-width **Log in**, and **Forgot password?** underneath.
- 1024 and 768: the same card, about 520px wide, still centered.
- 360: no card frame. Wordmark at the top (`POV` white, `Playbook` red). Fields full width. **Log in** is full width and 52px tall. **Forgot password?** is a 44px text link. The invite hint sits at the bottom.
- Inputs are at least 48px tall with 16px type. Every button and link is at least 44×44. No horizontal scroll.

## Scenario 6 — Accept invite

**Preconditions:** An accept-invite route is open. The token is 64 hex characters. Logged out.

**Steps:**

1. Open `/accept-invite?token=` plus 64 hex characters at each width.
2. Open `/accept-invite` with no token.

**Expected:**

- 1920 and 1024: a red `You're invited` banner and a centered card. Password and confirm sit side by side.
- 768: the same card, with password and confirm stacked.
- 360: the banner and every field stack. **Email** is an input, not read-only text, because the token does not carry the address. **Create account** is full width.
- A missing or short token uses the login card pattern from scenario 5 at that width and shows the invalid-invite sentence.
- Inputs, **Create account**, and **Log in** are at least 44px in both axes. No horizontal scroll.

## Scenario 7 — Password reset

**Steps:**

1. Open `/forgot-password` at each width and submit an address.

**Expected:**

- The layout matches Login (scenario 5) at that width.
- The form is replaced in place by `If that email has an account, a link is on its way`.
- No horizontal scroll.

## Scenario 15 — Account menu

**Steps:**

1. Open a signed-in screen that shows the account control, at 360 and at 1024.

**Expected:**

- The avatar is at least 44×44 and lives in the top bar. Its accessible name is `Account`.
- 1024 and up: a menu shows the account name, **Sign out**, and **Sign out everywhere**.
- 360: a bottom sheet shows the same items. **Sign out everywhere** is a full-width row in red text.
- Sign out is reachable in two taps.

Screens that are still not in this build (roster through scout look) stay scenarios 8–14 in `docs/responsive-screens.md`. Their numbers stay the same.
