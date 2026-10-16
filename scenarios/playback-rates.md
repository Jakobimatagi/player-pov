# Playback rates

The scrubber always offers **0.25×**, **0.5×**, **1×**, **1.5×**, and **2×**. Choosing a chip stores that rate on the play clock the same way as before: `clockState.rateRef.current` becomes the chip value, and the chip label is that number plus `×`. The dev console still reads time from `window.__pov.tRef`.

## Scenario 1 — Quarter speed is on the bar

**Preconditions:** http://127.0.0.1:5173 is open. The sample play is loaded.

**Steps:**

1. Read the speed chips in the scrubber.

**Expected:**

- The chips are **0.25×**, **0.5×**, **1×**, **1.5×**, and **2×**, in that order.
- **1×** is the pressed chip on a fresh load.
- **0.25×** is there without `?rate=0.25`.

## Scenario 2 — Slower than half speed

**Steps:**

1. Note `data-testid="clock-readout"`.
2. Click **0.5×**, then **Play**, and watch for about a second.
3. Pause, click **0.25×**, press Space, and watch for about a second.

**Expected:**

- **0.5×** moves the readout slower than **1×**. **0.25×** moves it slower than **0.5×**.
- The pressed chip matches the rate. `data-rate` on `data-testid="scrubber"` is `0.25` after the last click.
- **1.5×** and **2×** are still there.

## Scenario 3 — Phone width

**Steps:**

1. Open http://127.0.0.1:5173/ at 360×800.
2. Inspect **Play**, each speed chip, and the time slider.

**Expected:**

- The page does not scroll horizontally.
- The chips wrap inside the scrubber instead of running off the screen.
- **Play**, each speed chip, and the slider's hit area are at least 44×44 px.
