# Landing page

A logged-out visit to `/` shows a public page that says what the app does and what it costs, with **Start free** into signup (issue #63, step 5).

| Piece              | Where                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| Page               | `src/landing/LandingPage.tsx`                                                   |
| Who gets it        | `src/landing/gate.ts` (`showLanding`), called from `src/main.tsx`               |
| Images, video      | `public/landing/` (captured from the no-backend demo, see below)                |
| Title, description | `src/lib/brand.ts`, filled into `index.html` at build (title, meta, Open Graph) |
| Plans shown        | `PLANS` in the page, copied from `marketing/plans.md`                           |

## How the page stays light

`src/main.tsx` decides before any app code loads. A bare `/` (no query, no hash) with the anon env vars set and no `sb-*-auth-token` key in local storage loads only the landing chunk. Everything else loads the app router as before. The landing chunk does not import the router, Supabase or three.js, so a visitor downloads React and about 10 KB of page code, not the 3D bundle.

The page's links are plain `<a href>`. Clicking **Start free** or **Log in** loads the app at `/signup` or `/login`.

Auth redirects back to `/` carry `?code=` or `#access_token=`, so they always reach the app. A saved session that has expired also reaches the app, which sends it to `/login` as before.

## Scenario 1 — Logged-out visit

**Preconditions:** The anon env vars are set. No session (a private window).

**Steps:**

1. Open http://127.0.0.1:5173/ .

**Expected:**

- The page shows `Install it. Learn it. Win Friday.`, **Start free** and **Log in**, with the draw-a-play demo video beside it. The video shows its poster and does not play until you press play; it has no sound.
- The network panel shows no `router-*.js`, `useScenePalette-*.js` or `geometry-*.js` chunk (production build, `npm run build && npx vite preview`).
- The tab title is `Scheme HQ: Install it. Learn it. Win Friday.`
- While checkout is off (`VITE_CHECKOUT_ENABLED` unset), Team and Program show **Coming soon** instead of a button, with `Paid plans open soon.` under the cards. Starter keeps **Start free**.

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

## Scenario 6 — Keyboard

**Steps:**

1. From scenario 1, press Tab through the page.

**Expected:**

- Every link and FAQ question shows a solid orange focus ring, in page order: logo, Log in, Start free, Log in, the video's controls, plan buttons, the four questions, Start free, Log in.
- Enter on a question opens its answer.

## Scenario 7 — Share preview

**Steps:**

1. Paste https://www.schemehq.app into a Slack or iMessage message (or an Open Graph checker).

**Expected:**

- The preview shows `Scheme HQ: install, learn and scout your scheme`, the share description and the helmet-view image, loaded from `https://www.schemehq.app/landing/og.png`.

## Refreshing the screenshots

The images come from the no-backend demo, so they need no account or data. Run the app with `vite --mode demo` and a `.env.demo.local` that sets `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` empty, then capture:

| File               | Page                                                    | Size       |
| ------------------ | ------------------------------------------------------- | ---------- |
| `pov.webp`, og.png | `/`, POV view, about 1 s into the play                  | 1280 × 800 |
| `coach-home.webp`  | `/?home=coach`                                          | 1280 × 900 |
| `scout-pack.webp`  | `/playbook` → Opponents → Lincoln High → Week of Nov 23 | 1280, full |
| `player-home.webp` | `/?home=player`                                         | 390 × 844  |

Convert with `cwebp -q 82`. `og.png` stays PNG for link previews.

### The draw-a-play video

`draw-a-play.mp4` (1280 × 720, about 38 s, H.264, no sound, under 3 MB) and its poster `draw-a-play-poster.webp` are recorded from the same demo with a Playwright script driving Chrome (`recordVideo` at 1280 × 720, `colorScheme: 'dark'`, headed so the 3D view renders at full speed). The script adds a caption box (navy, orange edge, Geist) and a drawn cursor, then:

1. `/playbook?folder=ours`: set **Base alignment** to Gun Spread.
2. Click **Draw a play**. The editor opens lined up in Gun Spread. Rename the play `Four Verts`.
3. With the solid arrow, drag routes from X, Z, H and Y; with the T-cap, a block from the RB.
4. **Watch in 3D**: play it in Broadcast, then POV.
5. Back, **Done**: the play shows under Diagrams in the folder.

The raw WebM is trimmed, sped up (about 1.6–1.8×, 1.25× for the 3D part) and encoded to H.264 with `-pix_fmt yuv420p -movflags +faststart -an` at about 500 kbps (ffmpeg, or WebCodecs in Chrome). The poster is the frame with all four routes and the block drawn, through `cwebp -q 82`.

## Not in this step

- Terms and privacy pages. The footer links to them once they exist (issue #63, open question 11).
