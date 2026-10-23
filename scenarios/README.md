# Scenarios

These files are the manual checks for review and QA. Each feature area has one markdown file. A scenario is one numbered check with a precondition, exact steps, and the result you should see.

## Format

```markdown
## Scenario 1 — Short name

**Preconditions:** What is already true (server running, URL, play loaded).

**Steps:**

1. Exact URL, key, or click.

**Expected:**

- What you can see or measure. Include the words on screen when they are specified.
```

Number scenarios from 1 inside each file. Do not renumber a scenario once a pull request has cited it. Add new numbers at the end. If a step changes, edit that scenario in place and say so in the pull request.

## Run the app locally

```bash
npm install
pip install -r schema/requirements.txt
npm run dev
```

`schema/requirements.txt` is the Python side of play validation. Without `jsonschema`, the tests that compare against `schema/validate.py` skip and say to install that file.

Open http://127.0.0.1:5173 . The dev server exposes `window.__pov.tRef` and `window.__pov.playingRef` so a scenario can set the play clock from the console. Production builds do not.

Checks that every pull request runs before it opens:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Files

| File                           | Covers                                    |
| ------------------------------ | ----------------------------------------- |
| `webgl-fallback-and-errors.md` | No WebGL, context loss, DPR cap, resize   |
| `play-loading.md`              | Fetch, schema, watch id, draft, LoadError |
| `sampling.md`                  | Compile, Hermite motion, facing, clamp    |
| `scene-3d.md`                  | Field, players, ball                      |
| `responsive.md`                | Viewer widths and touch targets (1–4)     |
| `playback.md`                  | Play, pause, scrub, speeds                |
| `playback-rates.md`            | 0.25× through 2× on a phone               |
| `end-of-play.md`               | Replay                                    |
| `camera-pov.md`                | POV camera                                |
| `pov-free-look.md`             | POV free-look, Hold look, touch hop       |
| `gyro-look.md`                 | Look with phone                           |
| `camera-broadcast.md`          | Broadcast camera                          |
| `camera-top-down.md`           | Top-down camera                           |
| `player-hop.md`                | Attach and hop                            |
| `pov-picker.md`                | Watch as list                             |
| `touch.md`                     | Tap, swipe, orbit, pinch, POV hop         |
| `backend-setup.md`             | Identity schema, RLS, anon client         |
| `deploy.md`                    | Vercel, keep-alive, encrypted backup      |
| `touch.md`                     | Tap, swipe, orbit, pinch, hop chips       |
| `performance.md`               | Quality ladder and frame budget           |
| `blocky-and-facemask.md`       | Blocky players and the POV facemask       |
| `auth.md`                      | Sign in, reset, invite, sign out          |
| `team-management.md`           | Create team, roster, invites              |
| `play-compile.md`              | Source compile, looks, validator parity   |
| `waypoint-cap.md`              | 12-waypoint cap and route thinning        |
| `playbook-data.md`             | Play RLS, assigned reads, version conflict |

Play picker, share, and deep links are not in this engine pass. Do not look for those screens.

A file appears in the pull request that builds that feature. The pull request description cites `scenarios/<file>.md` and the scenario numbers it covers.
