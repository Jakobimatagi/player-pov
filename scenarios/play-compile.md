# Play compile

Coach source JSON compiles into the engine play file. The compiler is deterministic, and its errors point at the source leg that caused them.

```bash
npm run compile -- fixtures/trips-flood.source.json
python schema/validate.py /tmp/compiled.json schema/play.schema.json
```

Save the compile output as `/tmp/compiled.json` before the Python check.

## Scenario 1 — Trips flood compiles

**Preconditions:** The repo dependencies are installed.

**Steps:**

1. Run `npm run compile -- fixtures/trips-flood.source.json`.
2. Pass that JSON to `python schema/validate.py`.

**Expected:**

- The command prints a play file.
- `validate.py` prints `OK: schema + semantic checks pass`.

## Scenario 2 — A fast leg names its source path

**Steps:**

1. Run `npm run compile -- fixtures/trips-flood-fast.source.json`.

**Expected:**

- The process exits with an error.
- The output includes `players[h].legs[2]`.

## Scenario 3 — Cover 3 uses H's adjustment

**Steps:**

1. Compile `fixtures/trips-flood.source.json` with the Cover 2 look (the default).
2. Compile the same file with a look whose coverage is `Cover 3`.

**Expected:**

- H's route changes only for Cover 3.
- Cover 2 keeps the base corner route.

## Scenario 4 — The browser checksum matches node

**Preconditions:** `npm test` can run. Fixtures are the JSON files in `fixtures/` and `public/plays/`.

**Steps:**

1. Run `npx vitest run tests/play-input.test.ts`.

**Expected:**

- WebCrypto `checksumSource` equals node `playChecksum` on every fixture and on the Cover 2 and Cover 3 looks.
- `src/play/compileSource.ts` does not import `node:`.

## Scenario 5 — compileChart stays off node:crypto

**Steps:**

1. Run `npx vitest run tests/play-input.test.ts`.
2. Run `npm run build`, then `node scripts/scan-bundle.mjs dist`.

**Expected:**

- `compileChart` on Trips Flood vs Cover 2 returns 22 players and no checksum.
- A 15 yd/s leg maps to `{ side: 'ours', slot: 'h', leg: 2 }`.
- `scan-bundle` prints nothing and exits 0. A bundle that contains `node:crypto` fails that scan.
