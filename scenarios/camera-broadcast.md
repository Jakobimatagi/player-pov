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

**Status: Pending.** A later pull request attaches a player. Until then, the unit test is the check.

**Preconditions:** Nobody is attached. The unit test is the check until attach exists.

**Steps:**

1. Run `npx vitest run tests/camera.test.ts`.

**Expected:**

- With nobody attached, the aim is 70% ball and 30% the players' centroid.
- The sideline position matches that aim, clamped onto the field.
