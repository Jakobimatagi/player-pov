# Brand assets

Renders the Scheme HQ icon set and the link-share image into `public/` with headless Chrome. Re-run it after changing the mark, the brand colours, the name or tagline in `src/lib/brand.ts`, or `og.html`.

| File                           | Size     | What it is                                                                          |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------- |
| `public/favicon.svg`           | 32 grid  | The mark: orange rounded square, player O running a route to an arrow. Browser tab. |
| `public/favicon-32.png`        | 32×32    | PNG fallback for browsers without SVG favicons.                                     |
| `public/favicon.ico`           | 16 + 32  | Legacy `/favicon.ico` (PNG images inside), for crawlers and old browsers.           |
| `public/apple-touch-icon.png`  | 180×180  | iOS home screen. Full-bleed orange, no transparency; iOS rounds the corners.        |
| `public/icon-192.png`          | 192×192  | Manifest icon (`any`), same as the favicon.                                         |
| `public/icon-512.png`          | 512×512  | Manifest icon (`any`) and install splash.                                           |
| `public/icon-maskable-512.png` | 512×512  | Manifest icon (`maskable`): full-bleed, mark inside the centre 80% safe zone.       |
| `public/landing/og.png`        | 1200×630 | Share preview (Open Graph and Twitter): wordmark, tagline and the 3D helmet view.   |

The manifest itself is not a file here: `vite.config.ts` serves and builds `/manifest.webmanifest` from `webManifest()` in `src/components/brand/manifest.ts`, which reads the name, description and colours from `BRAND`.

## Running it

playwright-core is not a dependency of the app, so install it anywhere outside the repo and point the script at it. Needs Node 22.18 or later (the script imports `src/lib/brand.ts` directly) and `npm ci` done in the repo (the share image loads the fonts from `node_modules/@fontsource-variable`).

```sh
mkdir -p /tmp/pw && (cd /tmp/pw && npm install playwright-core@1.49.1)
PLAYWRIGHT_CORE=/tmp/pw/node_modules/playwright-core node scripts/brand-assets/render.mjs
```

- `CHROME_PATH` overrides the Chrome binary (defaults to the macOS app path).
- It also writes a pixel-zoomed sheet of the 16 and 32px favicons on light and dark tab colours (to `$BRAND_PREVIEW_DIR`, default your temp dir). Look at it after changing the mark: the 16px one should still read as O, route, arrow.
- PNGs are re-deflated at maximum compression by the script itself; no other tools needed.

## Changing things

- **The mark:** edit `GLYPH` in `render.mjs`, then copy the same shapes into `BrandMark` in `src/components/brand/Wordmark.tsx` (a test checks the paths match `favicon.svg`).
- **The share image:** edit `og.html`; open it straight in Chrome to see the layout (the name and tagline in it are placeholders that the script fills from `BRAND`). Keep text big: previews show it at roughly a quarter size.
