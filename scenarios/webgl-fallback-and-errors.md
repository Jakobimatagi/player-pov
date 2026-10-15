# WebGL fallback and errors

Covers §8a.1 and §8a.4. Run `npm run dev` and open http://127.0.0.1:5173 unless a step says otherwise.

## Scenario 1 — The app shows a canvas

**Preconditions:** A browser with WebGL. Dev server running.

**Steps:**

1. Open http://127.0.0.1:5173 .

**Expected:**

- A `<canvas>` fills the page.
- The clear color is the daytime sky (`#cfe3f5`).
- The page does not show the WebGL fallback heading.

## Scenario 2 — No WebGL shows the 2D diagram

**Preconditions:** Dev server running.

**Steps:**

1. Launch Chrome with `--disable-webgl` aimed at http://127.0.0.1:5173 .

**Expected:**

- The page does not crash and there is no blank canvas.
- The heading reads `This device or browser can't show 3D`.
- The steps mention `chrome://settings/system` and updating ChromeOS.
- An SVG diagram shows offense as circles, defense as X marks, and route polylines.
- The diagram is labeled with the play name `Trips Right Flood vs Cover 2`.
- A **Share link** button is visible.
- A **Reload** button is visible.

## Scenario 3 — Share still works without WebGL

**Preconditions:** Scenario 2 is on screen. Clipboard permission is granted, or a prompt is acceptable.

**Steps:**

1. Click **Share link**.

**Expected:**

- The clipboard, or the copy prompt, contains the current page URL.
- The diagram stays on screen.

## Scenario 4 — Context loss shows the overlay and restore keeps t

**Preconditions:** Scenario 1. Dev build, so `window.__pov` exists.

**Steps:**

1. In the console, run `window.__pov.tRef.current = 1.75`.
2. Run:
   ```js
   const gl = document.querySelector('canvas').getContext('webgl2')
   gl.getExtension('WEBGL_lose_context').loseContext()
   ```
3. Read `[data-testid="context-loss"]` and `[data-testid="play-t"]`.
4. Run `gl.getExtension('WEBGL_lose_context').restoreContext()`.

**Expected:**

- After step 2, a banner reads `Graphics reset, restoring…`.
- `data-held-t` on that banner is `1.75`.
- `window.__pov.playingRef.current` is `false`.
- After step 4, the banner is gone, the canvas is back, and `window.__pov.tRef.current` is still `1.75`.
- Playback stays paused.

## Scenario 5 — No restore within 5 seconds swaps to the fallback

**Preconditions:** Scenario 1.

**Steps:**

1. Set `window.__pov.tRef.current = 2`.
2. Call `loseContext()` as in Scenario 4 and do not restore.
3. Wait 5 seconds.

**Expected:**

- The fallback screen from Scenario 2 replaces the canvas.
- **Reload** is visible.
- The play clock is not reset by the swap (a reload is a separate action).

## Scenario 6 — Three losses in 60 seconds give up

**Preconditions:** Scenario 1.

**Steps:**

1. Three times within 60 seconds: `loseContext()`, wait until the banner is visible, then `restoreContext()`.

**Expected:**

- On the third loss, the fallback screen appears with **Reload** without waiting for the 5 second timer.

## Scenario 7 — DPR never exceeds 1.25 on a 2× display

**Preconditions:** Scenario 1. Device pixel ratio emulated at 2 (Chrome device metrics, `deviceScaleFactor: 2`).

**Steps:**

1. Reload the page.
2. Read `[data-testid="viewport"]` attribute `data-dpr` and the canvas `dataset.dpr`.
3. Compare `canvas.width` to `canvas.clientWidth`.

**Expected:**

- Both DPR values are `1.25`, not `2`.
- `canvas.width / canvas.clientWidth` is about `1.25` (within 0.05).

## Scenario 8 — Resize keeps the camera aspect

**Preconditions:** Scenario 1.

**Steps:**

1. Resize the window to about 800×900 and wait 200 ms for the debounced resize.
2. Read `canvas.clientWidth` and `canvas.clientHeight`.

**Expected:**

- The canvas still fills the viewport (no stretched bars, no zero-size canvas).
- `canvas.width / canvas.height` matches `(clientWidth / clientHeight) * dpr` within 2 pixels.
