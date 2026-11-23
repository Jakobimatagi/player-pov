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

## Still to do

- Light mode toggle: waits on #74 and #75 (about 200 hard-coded colours still assume the dark theme).
- Per-team school colour accent.
- Share image, app icons and manifest (#81); auth emails and Stripe product names (#79).
- Re-record the draw-a-play demo video for the landing hero.
