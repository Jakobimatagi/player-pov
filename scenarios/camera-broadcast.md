# Broadcast camera

Broadcast is the default. It sits on the offense's right sideline and follows the ball.

## Scenario 1 — The pass stays in frame

**Preconditions:** http://127.0.0.1:5173 is open. The mode is Broadcast.

**Steps:**

1. Press Space to play the sample through the throw (about 2.0 s to 2.9 s).

**Expected:**

- The camera is on the near sideline, 14 yd up.
- The ball stays in view from the snap through the catch.
- While the ball is in flight and more than 15 yd from the formation, the field of view opens from 40 toward 50.
- Pressing `2` or clicking **Broadcast** selects this mode. On a phone the visible word is `Broad`; the accessible name is `Broadcast`.

## Scenario 2 — An attached player takes the centroid's share

**Preconditions:** http://127.0.0.1:5173 is open in Broadcast. Nobody is attached (`data-attached` is empty).

**Steps:**

1. Watch the sideline framing for a moment.
2. Click the quarterback's box.

**Expected:**

- Before the click, the aim is 70% ball and 30% the players' centroid.
- After the click, `data-attached` is `qb` and the mode stays Broadcast.
- The aim eases, over about 0.6 s, so the quarterback takes that 30% instead of the centroid.
- The sideline camera stays clamped onto the field.
