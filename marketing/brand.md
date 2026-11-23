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
- Text on every surface passes WCAG 2.1 AA in both palettes, checked by `tests/contrast.test.ts`. Known gaps (#80): faint borders and inputs, the focus ring as the components use it (`ring-ring/50`), and light-mode destructive text on its 10% tint (4.38:1).
- Each team will get its school colour as an accent inside its own workspace; the Scheme HQ orange stays the product's colour.

### Adding a colour

- Add a token, never a literal. Define it in both palette blocks at the top of `src/index.css` (`:root` and `:root[data-theme='light']`), expose it in `@theme inline` as `--color-<name>: var(--<name>)`, then use it as a Tailwind class (`text-<name>`) or `var(--<name>)`. Canvas, Konva and three.js code reads the computed token rather than hard-coding a hex.
- `npm run lint` runs `scripts/check-colours.mjs`, which fails on a hex, `rgb()`/`hsl()`/`oklch()`-style function or `0xRRGGBB` number anywhere under `src/` outside the token blocks, `src/playsheet/playsheet.css` (print), `src/lib/brand.ts` (meta theme colour) and test files.
- A genuine exception gets a reason on the same line or the line above: `/* raw colour: print ink must stay black */` in CSS, `// raw colour: WebGL clear colour, read before CSS loads` in TS. No reason, no pass.
- `scripts/colour-baseline.json` is a temporary list of files that still had raw colours when the guard landed, with counts. Never add to it. A file that gains a raw colour fails; a file that gets clean fails until its entry is deleted; `node scripts/check-colours.mjs --update-baseline` locks in lower counts. #74 and #75 shrink it, #80 empties it.
- When you add a token that is used as text, a border or a focus ring, add its pairs to `PAIRS` in `tests/contrast.test.ts`. `npm test -- contrast` prints a table: one row per palette and pair with the ratio, the minimum (4.5 for text, 3 for large text and UI such as borders and focus rings) and PASS, FAIL or KNOWN. KNOWN rows are listed in `KNOWN_FAILURES` and must still fail; a pair that starts passing turns the test red until you delete its entry.

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

## Player colours

Retuned in #77 so the seven token colours a coach picks stay apart for colour-blind coaches (about 1 in 12 men). The values live in `src/theme/playerColors.ts`; saved plays store the names, so changing a value never needs a migration. `tests/player-colours.test.ts` checks every number below against the field tokens in `src/index.css`, so an edit that breaks one fails CI.

The set is split by lightness as well as hue (red and blue dark, orange and purple mid, green light, white lightest), because red-green colour blindness flattens hue but keeps lightness.

| Name   | Hex       | Label ink | Token on diagram field / end zone | Label on token |
| ------ | --------- | --------- | --------------------------------- | -------------- |
| White  | `#ffffff` | `#1f2328` | 19.3 / 18.2                       | 15.8           |
| Black  | `#2a2b2e` | `#ffffff` | outline 14.3 / 13.5 (fill 1.4)    | 14.2           |
| Red    | `#c0302f` | `#ffffff` | 3.4 / 3.2                         | 5.7            |
| Blue   | `#4264b2` | `#ffffff` | 3.4 / 3.2                         | 5.7            |
| Green  | `#58d28c` | `#1f2328` | 10.1 / 9.5                        | 8.3            |
| Orange | `#dc7e00` | `#1f2328` | 6.5 / 6.1                         | 5.3            |
| Purple | `#b380f8` | `#1f2328` | 6.8 / 6.4                         | 5.5            |

- **Lines** use the token colour, except white (`--diagram-line-white`, 17.7:1) and black (`--diagram-line-black`, 6.7:1).
- **Black** is a dark grey: no fill that still reads as black reaches 3:1 on stadium navy, so a black token is seen by the light ring every token gets (`--diagram-token-stroke`).
- **Closest pair, CIEDE2000** (Machado 2009 simulation, full severity; tokens, and lines in brackets): normal 24.5 blue/purple (18.3 black/purple), protanopia 16.9 blue/purple, deuteranopia 17.3 green/orange, tritanopia 17.4 red/orange (17.3 black/purple). The floor is 15.
- **3D and the no-WebGL preview** use the team colours: offense `#b40c28` (was `#c8102e`, darkened for 3:1 on both turf stripes), defense `#f2f2f2`. Two pairs can't reach 3:1 because of the field colour: the white jersey on the light 3D turf (about 2:1, still ΔE 21+ in every simulation) and the red offense ring on the dark-green preview field (1.1:1). Both are listed in the test and wait on the field tokens (#80).
- Before/after screenshots and a colour-blind simulation grid: `docs/screenshots/player-colours/`.
