# Scheme HQ brand

Decided 2026-11-22 (issue #73). The product's name and pitch live in code in `src/lib/brand.ts`; this doc is the reasoning and the rules around it.

## Name

**Scheme HQ.** A coaching staff's "scheme" is its whole offensive and defensive system. "HQ" says this is where the staff and the players run it from, every week. Short, SaaS-shaped, and it names the job (installs, learning and scouting), not one feature.

- Wordmark: `SCHEME HQ`, with `SCHEME` in chalk white and `HQ` in pylon orange, set in Big Shoulders Display, uppercase.
- In running text it is always `Scheme HQ` (two words, capital S, H and Q), never "SchemeHQ", "Schemehq" or "Scheme Hq". The domain stays lowercase and joined: `schemehq.app`.
- Replaces "POV Playbook" and "Player POV". The 3D player-view replay is a feature ("POV replay"), not the brand.

## Domain

**`www.schemehq.app`**, bought on Vercel on 2026-11-22 (renews yearly). `schemehq.app` and the old `player-pov.vercel.app` / `schemehq.vercel.app` addresses redirect to it. `schemehq.com` is taken. The address lives in code as `BRAND.url`. No trademark search has been done yet; do one before launch.

## Positioning

- **Who:** high school football coaching staffs (head coach, coordinators, position coaches) and their players.
- **What:** install the playbook, get every player learning it in 3D from their own position as homework, and build scout packs to prep for each opponent.
- **Against Hudl:** Hudl is film, breaking down what happened. Scheme HQ is the playbook and the prep, so players know what to do before Friday. It sits next to a film service rather than replacing it.
- **Tagline:** Install it. Learn it. Win Friday.
- **Voice:** a sharp coordinator talking to the staff: short, direct, football-literate, no corporate filler. Sentence case in the UI; uppercase only for display headings and the wordmark.

## Look: Friday night under the lights

| Role       | Dark (default)          | Light (not enabled yet)   |
| ---------- | ----------------------- | ------------------------- |
| Background | stadium navy            | chalk white               |
| Primary    | pylon orange, dark text | deeper orange, white text |
| Highlight  | scoreboard gold         | dark gold                 |
| Success    | turf green              | turf green, darker        |
| Info       | sky blue                | blue                      |
| Text       | chalk white             | navy ink                  |

- Display face: Big Shoulders Display (headings, wordmark, page titles). Body: Geist.
- Mark: a player (O) running an S-shaped route to an arrow, on an orange rounded square (`public/favicon.svg`).
- Every text/background token pair passes WCAG 2.1 AA in both palettes. The automated check is #76.
- Each team will get its school colour as an accent inside its own workspace; the Scheme HQ orange stays the product's colour.

## Icons and share image

Added in #81. All rendered from one drawing by `scripts/brand-assets/render.mjs` (how to re-run it is in that folder's README).

- **Mark:** dark ink (`#1a0d02`) on pylon orange (`#ff7a1f`), 7.3:1. Thick strokes and a flat middle step in the route so it still reads as O, route and arrow at 16px. The orange square is its own background, so it shows the same in light and dark browser tabs.
- **Favicon:** `favicon.svg`, with `favicon-32.png` and a 16+32 `favicon.ico` as fallbacks.
- **Home screen:** `apple-touch-icon.png` (180, full-bleed orange) for iOS; the web app manifest (`/manifest.webmanifest`, built from `BRAND` by the Vite config, so the name and colours follow `src/lib/brand.ts`) lists `icon-192.png`, `icon-512.png` and a maskable `icon-maskable-512.png` for Android. Installed, it opens standalone on stadium navy.
- **Share image:** `public/landing/og.png`, 1200×630: mark and `SCHEME HQ` wordmark, the tagline in big display type (Win Friday in scoreboard gold), `schemehq.app`, and a tilted crop of the 3D helmet view with an orange frame. Used for both Open Graph and Twitter cards.

## Still to do

- Light mode toggle: waits on #74 and #75 (about 200 hard-coded colours still assume the dark theme).
- Per-team school colour accent.
- Auth emails and Stripe product names (#79) are done in the repo and in Stripe; the hosted Supabase email templates and sender name still have to be pasted in the dashboard (`scenarios/auth.md`).
