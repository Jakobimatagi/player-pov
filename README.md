# POV Playbook

Replay a football play in 3D from any player's helmet camera.

```bash
npm install
npm run dev
```

`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` are the checks CI runs. A second CI job starts a local Supabase database and runs `supabase test db`.

Python parity with `schema/validate.py` needs the `jsonschema` module:

```bash
pip install -r schema/requirements.txt
```

If that module is missing, those tests skip and print that install command.

## Local backend

Docker is required. These commands apply `supabase/migrations` and `supabase/seed.sql`.

```bash
npx supabase start
npx supabase db reset
```

Studio is at http://127.0.0.1:54323 . The seeded team is **Demo Knights** (head coach `coach@demo.local`, local password `password1234`). Copy the API URL and anon key from `npx supabase status` into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Leave them unset to run the 3D viewer with no backend. Do not put the service-role key in `.env.local` or in any `VITE_` variable.

## Hosting

Vercel Hobby project **player-pov** (`prj_SRL6YyKAz9unWp7dEa4Xr5HQDxHe`) and the Supabase free-tier project **player-pov** (`bfaopibbbldsxvjprfdx`) are one pair for an unpaid personal pilot. Hobby is non-commercial: move to Vercel Pro before charging a team. Move Supabase to Pro on the first paid team, the first missed keep-alive, or a database over 300 MB.

`vercel.json` rewrites every path to `index.html`. `keepalive.yml` calls `GET /rest/v1/rpc/health` every two days. `backup.yml` uploads an age-encrypted dump each night. The private age key stays offline. `deploy.yml` waits for the GitHub `production` environment, then pushes migrations to that one database. Preview and production share the same Supabase URL and anon key. The env vars, cron, and migration order are in `scenarios/deploy.md`.
