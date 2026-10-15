# 3D scene

The field is geometry, not a texture. Open http://127.0.0.1:5173 after `npm run dev`. The sample play must load.

## Scenario 1 — Yard lines and numbers stay sharp

**Preconditions:** WebGL available.

**Steps:**

1. Open http://127.0.0.1:5173/?dpr is not required. In DevTools, set device pixel ratio emulation to 0.75, or append nothing and inspect the canvas `data-dpr` only as a cap. Reload at a narrow window so the field fills the view.

**Expected:**

- The sky is light blue.
- Grass is green with alternating mow stripes.
- White yard lines, hash marks, and block numbers are crisp edges, not a blurred texture.
- Yellow goalposts stand on both goal lines.

## Scenario 2 — NCAA hashes

**Steps:**

1. Open http://127.0.0.1:5173/?hash=ncaa .
2. Compare the hash marks with http://127.0.0.1:5173/ .

**Expected:**

- The hash marks sit farther from the sidelines than the NFHS default.
- The unit test `tests/field.test.ts` expects NFHS y = 17.78 and 35.56, and NCAA y = 20 and 33.33.

## Scenario 3 — Ball spot on the 25

**Steps:**

1. Open http://127.0.0.1:5173/?spot=1 .

**Expected:**

- A red sphere sits on the near hash side of midfield, on the 25-yard line (field x = 35, y = 26.67), which is world x = −25 and z ≈ 0.

## Scenario 4 — Triangle budget

**Steps:**

1. Run `npx vitest run tests/field.test.ts`.

**Expected:**

- Grass is 48 triangles.
- Markings, including goalposts, are at or under 2,000 triangles.
- The field is two draw calls besides the optional debug sphere: grass, then markings.

## Scenario 5 — Twenty-two players at the snap

**Preconditions:** The sample play has loaded.

**Steps:**

1. Open http://127.0.0.1:5173/ .

**Expected:**

- 22 boxes stand on the formation at the snap.
- Offense is `#c8102e`. Defense is `#f2f2f2`.
- The front face of each box is darker than the sides.

## Scenario 6 — Jersey numbers from the sideline

**Steps:**

1. Look at the formation from the sideline camera (the default frame, south of the field).

**Expected:**

- White jersey numbers are readable on the sides of the boxes, not only on the chest and back.
- Numbers are one draw call for every player.

## Scenario 7 — Swap the player visual

**Steps:**

1. Read `src/scene/Players.tsx`.

**Expected:**

- It takes a `PlayerVisual` and does not import `BoxGeometry` or a body material.
- Passing a different visual is the only change required to swap the art.

## Scenario 8 — The ball follows the sample

**Preconditions:** Dev server running. WebGL available.

**Steps:**

1. Open http://127.0.0.1:5173/ .
2. Run `npx vitest run tests/ball.test.ts`.

**Expected:**

- A tan prolate ball is on the field with the players. It is one mesh, 80 triangles.
- At the snap the ball leaves the center and arrives at the quarterback.
- While the quarterback carries it, the ball stays at his hand (0.35 yd forward, 1.1 yd up) and moves with his velocity.
- The throw leaves the quarterback at 2.0 s, peaks halfway by the apex (3 yd) above the straight line between the hands, and is in H's hand at 2.9 s.
- Before t = 0 and after the play ends, the ball holds still at the first and last hand positions.
- Players are sampled once per frame, so facing is not smoothed twice.
