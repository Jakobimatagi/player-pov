# Landing page

A logged-out visit to `/` shows a public page that says what the app does and what it costs, with **Start free** into signup (issue #63, step 5).

| Piece              | Where                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| Page               | `src/landing/LandingPage.tsx`                                                  |
| Who gets it        | `src/landing/gate.ts` (`showLanding`), called from `src/main.tsx`              |
| Images and video   | `public/landing/` (screenshots from `docs/screenshots/`, the draw-a-play demo) |
| Title, description | `index.html` (`<title>`, meta description, Open Graph)                         |
| Plans shown        | `PLANS` in the page, copied from `marketing/plans.md`                          |

## How the page stays light

`src/main.tsx` decides before any app code loads. A bare `/` (no query, no hash) with the anon env vars set and no `sb-*-auth-token` key in local storage loads only the landing chunk. Everything else loads the app router as before. The landing chunk does not import the router, Supabase or three.js, so a visitor downloads React and about 10 KB of page code, not the 3D bundle.

The page's links are plain `<a href>`. Clicking **Start free** or **Log in** loads the app at `/signup` or `/login`.

Auth redirects back to `/` carry `?code=` or `#access_token=`, so they always reach the app. A saved session that has expired also reaches the app, which sends it to `/login` as before.

## Scenario 1 — Logged-out visit

**Preconditions:** The anon env vars are set. No session (a private window).

**Steps:**

1. Open http://127.0.0.1:5173/ .

**Expected:**

- The page shows `Your playbook, seen from the helmet.`, **Start free** and **Log in**.
- The network panel shows no `router-*.js`, `useScenePalette-*.js` or `geometry-*.js` chunk (production build, `npm run build && npx vite preview`).
- The video does not play until you press play. It is muted.
- The tab title is `POV Playbook: football plays in 3D from the player's helmet`.

## Scenario 2 — Start free

**Steps:**

1. From scenario 1, click **Start free**.

**Expected:**

- The address is `/signup` and the Create account form shows `I'm a coach creating a team` (see `auth.md` scenario 6).

## Scenario 3 — Logged-in visit

**Preconditions:** Signed in as the seeded coach.

**Steps:**

1. Open http://127.0.0.1:5173/ .

**Expected:**

- Coach Home shows, as before. The landing page does not flash first.

## Scenario 4 — Deep link while logged out

**Steps:**

1. In a private window, open http://127.0.0.1:5173/watch/00000000-0000-4000-8000-0000000000a1 .

**Expected:**

- It redirects to `/login?next=/watch/00000000-0000-4000-8000-0000000000a1`, as in `auth.md` scenario 5.

## Scenario 5 — Phone

**Steps:**

1. Open scenario 1 at 390 × 844.

**Expected:**

- No sideways scroll. The hero, video, features, three plan cards and questions stack in one column.
- The FAQ answers open and close on tap.

## Not in this step

- Terms and privacy pages. The footer links to them once they exist (issue #63, open question 11).
- Prices are the recommendation in `marketing/plans.md`. Confirm them before this ships to production (open question 1).
- `og:image` is a relative path until the app has a domain. Most link previews need an absolute URL.
