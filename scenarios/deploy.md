# Deploy and free-tier ops

The app is a static Vite build on the Vercel Hobby project **player-pov** (`prj_SRL6YyKAz9unWp7dEa4Xr5HQDxHe`). The database is the Supabase free-tier project **player-pov** (`bfaopibbbldsxvjprfdx`, us-west-1, `https://bfaopibbbldsxvjprfdx.supabase.co`). Preview and production use that same project. There is no second Supabase project.

Vercel Hobby is for an unpaid personal pilot only. Move to Vercel Pro before any paid team. Move Supabase to Pro on the first paid team, the first missed keep-alive, or a database over 300 MB.

`deploy.yml` pushes migrations on every merge to `main`, after the GitHub `production` environment approves the job. The frontend deploys from the Vercel GitHub integration, not from that workflow. `vercel.json` sends every path to `index.html`. Keep-alive and backup are GitHub Actions schedules, not Vercel Cron. GitHub turns scheduled workflows off after 60 days with no repository activity.

Do not apply `supabase/seed.sql` on the hosted project. The password in that file is for the local demo only.

## Infra, in order

This pull request does not apply any of the following.

1. Leave Supabase **player-pov** on the free tier. Do not run `supabase/seed.sql` there.
2. Apply `supabase/migrations/20261015120000_identity.sql`.
3. Apply `supabase/migrations/20261015130100_health.sql`.
4. On Vercel project **player-pov** (`prj_SRL6YyKAz9unWp7dEa4Xr5HQDxHe`), Hobby, framework Vite, output directory `dist`, set Production and Preview:
   - `VITE_SUPABASE_URL` = `https://bfaopibbbldsxvjprfdx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the anon key from the Supabase dashboard
   - Do not set a service-role key.
   - Auth redirect URLs are the production host `/**` and, only if preview mail should work, `https://player-pov-*-<team-slug>.vercel.app/**`. Do not allow `https://*.vercel.app/**`. Otherwise leave mail links off for previews.
5. Create the GitHub environment `production` with a required reviewer. `deploy.yml` uses it before `supabase db push`.
6. GitHub Actions secrets:
   - `VITE_SUPABASE_URL` (same URL as Vercel)
   - `VITE_SUPABASE_ANON_KEY` (same anon key as Vercel)
   - `SUPABASE_DB_URL` (database connection string for player-pov; it contains the database password)
   - `BACKUP_AGE_PUBLIC_KEY` (age public key only). Generate a key pair with `age-keygen` on a machine you control and keep the private key offline.
7. Cron, in GitHub Actions: Keepalive `0 15 */2 * *`, Backup `0 10 * * *`, and a monthly empty commit `0 12 1 * *` so GitHub does not disable schedules after 60 days without a push. `activity.yml` sets `permissions: contents: write`. That push fails on a protected default branch until the branch allows the Actions token. Turn on Actions failure email.

## Scenario 1 — Preview shows the viewer

**Preconditions:** Vercel project player-pov is connected to this repo. Preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are the free-tier URL and anon key. This pull request has a Vercel preview deployment.

**Steps:**

1. Open the preview URL from the pull request checks.

**Expected:**

- The engine viewer loads (field, players, camera bar).
- The page is served over HTTPS.

## Scenario 2 — Deep route does not 404

**Preconditions:** Scenario 1's preview URL, or `npm run build && npm run preview` behind a host that uses `vercel.json`.

**Steps:**

1. Open `<preview-origin>/does-not-exist`.
2. Hard refresh.

**Expected:**

- The response is the app shell, not a host 404 page.
- The viewer chrome is on screen.

## Scenario 3 — Production URL

**Preconditions:** Production env vars on Vercel project player-pov point at Supabase player-pov. A custom domain is not part of this check.

**Steps:**

1. Open the Vercel production URL for player-pov.

**Expected:**

- The viewer loads over HTTPS.
- The certificate is valid.

## Scenario 4 — Keep-alive

**Preconditions:** GitHub Actions secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are the free-tier project. Migration `20261015130100_health.sql` is applied. Actions failure email is on.

**Steps:**

1. Actions → Keepalive → Run workflow.
2. Change `VITE_SUPABASE_URL` to `https://example.invalid` and run the workflow again.
3. Put the real URL back.

**Expected:**

- The first run is green.
- The second run is red.
- GitHub sends a failure email.

## Scenario 5 — Encrypted backup restores

**Preconditions:** GitHub Actions secrets `SUPABASE_DB_URL` and `BACKUP_AGE_PUBLIC_KEY` are set. The matching age private key is offline, not in GitHub and not in the repo.

**Steps:**

1. Actions → Backup → Run workflow.
2. Download the `db-backup` artifact.
3. `age -d -i backup.key -o backup.tar.gz backup.tar.gz.age`
4. `tar -xzf backup.tar.gz`
5. On the hosted database, note `select count(*) from auth.users` and `select count(*) from public.teams`.
6. Restore with `psql` into a local database: schema file, then data file.
7. Run the same two counts on the restored database.

**Expected:**

- The artifact is an `.age` file. The zip from GitHub does not contain `schema.sql` or `data.sql` in the clear.
- `schema.sql` creates the `auth` schema, not only `public`.
- The restored `auth.users` count and `public.teams` count match the hosted counts.
- Demo Knights is local seed data and is not in a hosted dump.
