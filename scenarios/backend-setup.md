# Backend setup

Local Supabase holds teams, profiles, memberships, invites, and consent records. Row level security is on for every public table. The browser client is created only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and it never reads a service-role key. The 3D viewer still runs with those variables unset.

The hosted project is **player-pov**, ref `bfaopibbbldsxvjprfdx`, region `us-west-1`. Point the two env vars at it. Do not commit the anon key. This pull request does not apply schema to that project. When it is applied, run the migration files in this order and do not run `supabase/seed.sql` there:

1. `supabase/migrations/20261015120000_identity.sql`

`roster_public` exposes `team_id`, `user_id`, `display_name`, `position`, and `role`. It does not expose email. The architecture sentence that lists only the three name columns is the privacy rule; the view keeps the two ids from the DDL so the app can tell rows apart.

## Scenario 1 — Seeded team in Studio

**Preconditions:** Docker is running. The repo is cloned. No local Supabase stack is running yet.

**Steps:**

1. `npm install`
2. `npx supabase start`
3. `npx supabase db reset`
4. Open Studio at http://127.0.0.1:54323 .
5. Open the Table Editor and the `teams` table.

**Expected:**

- One row named `Demo Knights`, school `Demo High`, season `2026`, `hash_rule` `NFHS`, `season_ends_on` `2026-11-30`.
- `memberships` has one row for that team with role `head_coach`.
- `profiles` shows `Coach Kim`.

## Scenario 2 — Anon key sees no memberships

**Preconditions:** Scenario 1 has finished. `npx supabase status` shows the anon key.

**Steps:**

1. Run:

```bash
curl -s "http://127.0.0.1:54321/rest/v1/memberships?select=*" \
  -H "apikey: ANON_KEY" \
  -H "Authorization: Bearer ANON_KEY"
```

Replace `ANON_KEY` with the anon key from `npx supabase status`.

**Expected:**

- The body is `[]`.
- The status is 200.

## Scenario 3 — Team B sees nothing of team A

**Preconditions:** Scenario 1 has finished.

**Steps:**

1. `npx supabase test db`
2. Read `supabase/tests/identity.test.sql`. The fixture is team A (`t1` head coach, `c1` coach, `p_qb` player QB, `p_fs` player S) and team B (`t2`).

**Expected:**

- The pgTAP file passes, including assertion 5: as `t2`, every public table returns 0 rows of team A.
- Assertion 4: `t1` inserts an invite and deletes `c1`, and deleting `t1` raises `cannot remove the last head coach`.
- Assertion 9: after that delete, `c1`'s jwt sees 0 membership rows.
- Assertion 10: `p_qb` sees exactly one membership row (their own). `roster_public` returns all four team A members and no email column.
- `scripts/check-rls.sql` is what CI runs after the tests. It raises if any public table has row level security off.

## Scenario 4 — Viewer with no login

**Preconditions:** `.env.local` is absent, or `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are both empty.

**Steps:**

1. `npm run dev`
2. Open http://127.0.0.1:5173 .

**Expected:**

- The field, players, and playback load.
- There is no sign-in screen.
