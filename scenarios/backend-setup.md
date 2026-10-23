# Backend setup

Local Supabase holds teams, profiles, memberships, invites, and consent records. Row level security is on for every public table. The browser client is created only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and it never reads a service-role key. The 3D viewer still runs with those variables unset.

The hosted project is **player-pov**, ref `bfaopibbbldsxvjprfdx`, region `us-west-1`. Point the two env vars at it. Do not commit the anon key. This pull request does not apply schema to that project. When it is applied, run the migration files in this order and do not run `supabase/seed.sql` there:

1. `supabase/migrations/20261015120000_identity.sql`

`supabase/down/20261015120000_identity.sql` drops that migration and leaves `citext` and `pgcrypto` in place. It is not in `supabase/migrations`, so `supabase db push` does not apply it. Members join only through `app.accept_invite`, called from `public.accept_invite` so the API can reach it. A head coach stores `sha256` of a 32-byte token, never the token itself. Anon has no table grants. Authenticated can update `memberships.role` and `memberships.position` only, and `teams.name`, `teams.school`, `teams.season`, `teams.hash_rule`, and `teams.season_ends_on` only. `teams.created_by` stays with the owner. If that owner deletes their account and no other head coach remains, the team is ownerless. There is no repair for that case yet.

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

- The status is 401 or 403.
- The body is not a list of membership rows. Anon has no grant on `memberships`.

## Scenario 3 — Team B sees nothing of team A

**Preconditions:** Scenario 1 has finished.

**Steps:**

1. `npx supabase test db`
2. Read `supabase/tests/identity.test.sql`. The fixture is team A (`t1` head coach, `c1` coach, `p_qb` player QB, `p_fs` player S) and team B (`t2`).

**Expected:**

- The pgTAP file passes, including assertion 5: as `t2`, every public table returns 0 rows of team A.
- Assertion 4: `t1` inserts an invite and deletes `c1`, and deleting `t1` raises `cannot remove the last head coach`.
- A direct insert into `memberships` is denied. `accept_invite` fails for the wrong email, an expired invite, a reused invite, and a missing consent record.
- A co-head cannot demote or remove another head coach. The team owner can demote the co-head.
- As `t1` (`set role authenticated` with jwt claims), changing `teams.created_by` fails, and changing `memberships.user_id` or `memberships.team_id` fails with `permission denied for table memberships`.
- If the owner deletes their account and no other head coach exists, `created_by` stays null and the team is ownerless. No repair is implemented.
- The raw invite token is not stored. A second open invite for the same team and email is rejected.
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

## Scenario 5 — Team RPCs in pgTAP

**Preconditions:** Scenario 1 has finished. Local migrations through `supabase/migrations/20261015140200_team.sql` are applied. Do not run this against the hosted project.

**Steps:**

1. `npx supabase test db`
2. Read `supabase/tests/team.test.sql`.

**Expected:**

- The file runs 25 of 25 assertions, and the file passes.
- `create_team` is called as its own statement, then the test reads `memberships.role`. The caller is `head_coach` of `Knights`. A fourth team for that user raises `a fourth team is rejected`.
- A player invite with consent stores a `consent_records` row at `consent-v0-provisional`. An assistant coach's invite raises `not allowed`.
- An assistant coach cannot insert into `memberships`. Joining is only through `accept_invite`. The direct insert raises insufficient privilege, and the file continues through the rest of the assertions.
