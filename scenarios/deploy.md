# Deploy and free-tier ops

The app is a static Vite build. Vercel Hobby is for an unpaid personal pilot only. Move to Vercel Pro before any paid team. Move Supabase to Pro on the first paid team, the first missed keep-alive, or a database over 300 MB.

Preview deployments use the staging Supabase project. Production uses the production project. `deploy.yml` pushes migrations to staging on every merge to `main`, then waits on the GitHub `production` environment before pushing to production. The frontend itself deploys from the Vercel GitHub integration, not from that workflow.

## Scenario 1 — Preview shows the viewer

**Preconditions:** The Vercel project is connected to this repo. Preview env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` point at staging. This pull request has a Vercel preview deployment.

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

## Scenario 3 — Production on the custom domain

**Preconditions:** The domain is attached to the Vercel production project and DNS has propagated. Production env vars point at the production Supabase project.

**Steps:**

1. Open `https://<your-domain>/`.

**Expected:**

- The viewer loads over HTTPS on that domain.
- The certificate is valid.

## Scenario 4 — Keep-alive

**Preconditions:** GitHub secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_URL`, and `STAGING_SUPABASE_ANON_KEY` are set. Migration `20261015130100_health.sql` is applied on both projects. Actions failure email is enabled for the founder.

**Steps:**

1. Actions → Keepalive → Run workflow.
2. Change `VITE_SUPABASE_URL` to `https://example.invalid` and run the workflow again.
3. Put the real URL back.

**Expected:**

- The first run is green for production and staging.
- The second run is red on production.
- GitHub sends a failure email to the founder.

## Scenario 5 — Encrypted backup restores

**Preconditions:** `SUPABASE_DB_URL`, `STAGING_SUPABASE_DB_URL`, and `BACKUP_AGE_PUBLIC_KEY` are set. The matching age private key is offline, not in GitHub.

**Steps:**

1. Actions → Backup → Run workflow.
2. Download `db-backup-production`.
3. `age -d -i backup.key -o backup.tar.gz backup-production.tar.gz.age`
4. `tar -xzf backup.tar.gz`
5. `npx supabase start` and restore with `psql` into the local database: schema file, then data file.

**Expected:**

- The artifact is an `.age` file. The zip from GitHub does not contain `schema.sql` or `data.sql` in the clear.
- After restore, Studio shows the `Demo Knights` team if that row was in the dump.
