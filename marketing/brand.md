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

| Role        | Dark (default)                    | Light (not enabled yet)           | Token                    |
| ----------- | --------------------------------- | --------------------------------- | ------------------------ |
| Background  | stadium navy                      | chalk white                       | `--background`, `--card` |
| Primary     | pylon orange, dark text           | deeper orange, white text         | `--primary`              |
| Highlight   | scoreboard gold                   | dark gold                         | `--gold`                 |
| Success     | turf green                        | turf green, darker                | `--success`              |
| Info        | sky blue                          | blue                              | `--info`                 |
| Danger      | signal red                        | deep red                          | `--destructive`          |
| Text        | chalk white                       | navy ink                          | `--foreground`           |
| Focus ring  | pylon orange, 2px with a 2px gap  | deeper orange, 2px with a 2px gap | `--ring`                 |
| Field edges | chalk at 43%, just over 3:1       | navy ink at 46%, just over 3:1    | `--input`                |
| Hairlines   | chalk at 11% (cards, dividers)    | navy ink at 12%                   | `--border`               |
| Control     | chalk at 16% (button, chip edges) | navy ink at 18%                   | `--control`              |

The exact values are the two palette blocks at the top of `src/index.css`; this table is what they mean.

- Display face: Big Shoulders Display (headings, wordmark, page titles). Body: Geist.
- Mark: a player (O) running an S-shaped route to an arrow, on an orange rounded square (`public/favicon.svg`).
- Text on every surface passes WCAG 2.1 AA in both palettes, checked by `tests/contrast.test.ts`. Known gaps: none (#80 emptied `KNOWN_FAILURES`).
- Focus: one ring everywhere, the `focus-ring` utility (`focus-visible:focus-ring` on components; the base layer gives it to anything focusable that does not style its own). It is drawn outside the element with a 2px gap, so it always sits on the surface, never on the element's fill, which is why an orange ring still reads around an orange button. Sidebar items use a 2px `ring-sidebar-ring` that hugs the item instead, so the scrolling sidebar does not clip it.
- Edges: a form field's edge (input, select, textarea) uses `--input` and passes 3:1, because the edge is what shows the field is there. Buttons, chips, tabs and panels are identified by their label, so their edge is decorative and uses `--control`; cards and dividers use the fainter `--border`. Do not put `--border` or `--control` on a field.
- Light destructive is `oklch(0.53 0.22 27)` (was 0.55) so red text on its own 10% tint passes 4.5:1.
- Each team will get its school colour as an accent inside its own workspace; the Scheme HQ orange stays the product's colour.

### Adding a colour

- Add a token, never a literal. Define it in both palette blocks at the top of `src/index.css` (`:root` and `:root[data-theme='light']`), expose it in `@theme inline` as `--color-<name>: var(--<name>)`, then use it as a Tailwind class (`text-<name>`) or `var(--<name>)`. Canvas, Konva and three.js code reads the computed token rather than hard-coding a hex.
- `npm run lint` runs `scripts/check-colours.mjs`, which fails on a hex, `rgb()`/`hsl()`/`oklch()`-style function or `0xRRGGBB` number anywhere under `src/` outside the token blocks, `src/lib/brand.ts` (meta theme colour) and test files.
- A genuine exception gets a reason on the same line or the line above: `/* raw colour: print ink must stay black */` in CSS, `// raw colour: WebGL clear colour, read before CSS loads` in TS. No reason, no pass.
- `scripts/colour-baseline.json` is a temporary list of files that still had raw colours when the guard landed, with counts. Never add to it. A file that gains a raw colour fails; a file that gets clean fails until its entry is deleted; `node scripts/check-colours.mjs --update-baseline` locks in lower counts. #74 and #75 shrink it, #80 empties it.
- When you add a token that is used as text, a border or a focus ring, add its pairs to `PAIRS` in `tests/contrast.test.ts`. `npm test -- contrast` prints a table: one row per palette and pair with the ratio, the minimum (4.5 for text, 3 for large text and UI such as field edges and focus rings) and PASS, FAIL or KNOWN, then the decorative edges (DECOR). `KNOWN_FAILURES` is empty; keep it that way. A purely decorative edge goes in `DECORATIVE` with the reason, never in `KNOWN_FAILURES`.

## Icons and share image

Added in #81. All rendered from one drawing by `scripts/brand-assets/render.mjs` (how to re-run it is in that folder's README).

- **Mark:** dark ink (`#1a0d02`) on pylon orange (`#ff7a1f`), 7.3:1. Thick strokes and a flat middle step in the route so it still reads as O, route and arrow at 16px. The orange square is its own background, so it shows the same in light and dark browser tabs.
- **Favicon:** `favicon.svg`, with `favicon-32.png` and a 16+32 `favicon.ico` as fallbacks.
- **Home screen:** `apple-touch-icon.png` (180, full-bleed orange) for iOS; the web app manifest (`/manifest.webmanifest`, built from `BRAND` by the Vite config, so the name and colours follow `src/lib/brand.ts`) lists `icon-192.png`, `icon-512.png` and a maskable `icon-maskable-512.png` for Android. Installed, it opens standalone on stadium navy.
- **Share image:** `public/landing/og.png`, 1200×630: mark and `SCHEME HQ` wordmark, the tagline in big display type (Win Friday in scoreboard gold), `schemehq.app`, and a tilted crop of the 3D helmet view with an orange frame. Used for both Open Graph and Twitter cards.

## Still to do

- Light mode toggle: every colour now reads a token and both palettes pass the contrast test (#74, #75, #80). What is left is the switch itself, and pointing Tailwind's `dark:` variant (today `.dark`, which nothing sets) at the dark palette.
- Per-team school colour accent.
- Auth emails and Stripe product names (#79) are done in the repo and in Stripe; the hosted Supabase email templates and sender name still have to be pasted in the dashboard (`scenarios/auth.md`).
