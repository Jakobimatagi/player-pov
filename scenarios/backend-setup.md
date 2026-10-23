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

- The file runs 29 of 29 assertions, and the file passes.
- `create_team` is called as its own statement and the returned id is kept. `teams.created_by` for that id is `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01`. The `head_coach` membership is read by that id. A fourth team for that user raises `a fourth team is rejected`.
- A call with a null `auth.uid()` raises `sign in required`. On a database that also has `supabase/migrations/20261023000000_revoke_anon_rpc.sql`, a call as `anon` raises `42501`. A hash rule other than `NFHS` or `NCAA` raises `hash rule must be NFHS or NCAA`. Duplicate team names are allowed, and this file does not reject them.
- A player invite with consent stores a `consent_records` row at `consent-v0-provisional`. An assistant coach's invite raises `not allowed`.
- An assistant coach cannot insert into `memberships`. Joining is only through `accept_invite`. The direct insert raises `42501`, and the file continues through the rest of the assertions.

## Scenario 6 — Anon cannot execute security definer functions

**Preconditions:** Scenario 1 has finished, so `supabase/migrations/20261023000000_revoke_anon_rpc.sql` is applied on the local database. Do not run this against the hosted project.

**Steps:**

1. `npx supabase test db`
2. Read `supabase/tests/anon_rpc.test.sql`.

**Expected:**

- The file passes 12 assertions. No `SECURITY DEFINER` function outside system schemas is executable by `anon`. The check is `has_function_privilege('anon', p.oid, 'EXECUTE')` over `pg_proc` and `pg_namespace` where `prosecdef` is true. It skips `pg_catalog`, `information_schema`, `pg_toast`, other `pg_*` schemas, and the Supabase internals `auth`, `storage`, `extensions`, `graphql`, `graphql_public`, `realtime`, `vault`, `net`, `supabase_functions`, `pgsodium`, and `pgsodium_masks`. `public` and `app` are included.
- That covers the nine functions from `supabase/migrations/20261015140200_team.sql`: `create_team(text, text, text, text, date)`, `create_player_invite(uuid, text, text, public.team_role, public.position_code, boolean, text)`, `accept_invite(uuid)`, `delete_member_data(uuid, uuid)`, `update_member(uuid, uuid, public.team_role, public.position_code)`, `remove_member(uuid, uuid)`, `revoke_invite(uuid)`, `resend_invite(uuid)`, and `invite_status(uuid)`. Each one is still executable by `authenticated`.
- It also covers the `app` security definer functions: `my_role`, `is_member`, `is_staff`, `is_head_coach`, `is_owner`, `guard_last_head_coach`, `transfer_team_owner`, `guard_team_owner`, `cap_invite_expiry`, `stamp_attested_email`, and `accept_invite`.
- As `anon`, `select public.invite_status(gen_random_uuid())` raises `42501`.
- A function created afterward in `public` by `postgres` is not executable by `anon`. The migration revokes the hard-wired public default and the schema defaults for `anon`. In `public`, `authenticated` and `service_role` still have a schema default execute grant; write an explicit grant anyway so the function does not depend on that default. Every new extension function, and every function outside `public`, needs an explicit `grant execute` to `authenticated` and to `service_role`. `anon` does not receive those grants.
- `public.health()` is `security invoker` in `supabase/migrations/20261015130100_health.sql`, and `public.position_group_of` is not security definer in `supabase/migrations/20261015120000_identity.sql`. This assertion does not change their anon grants. Anon can still call `health`.
- `public.roster_public` is a security definer view by design. Select is granted only to `authenticated`. `anon` and `public` are revoked. Advisor lint 0010 on that view is expected.
- `supabase/down/20261023000000_revoke_anon_rpc.sql` re-grants execute on those nine functions to `anon`. It restores the global default with `grant execute on functions to public`, and the `public` schema default with `grant execute on functions to anon`. It does not add a default grant in schema `app`. It is not in `supabase/migrations`, so `supabase db push` does not apply it.
