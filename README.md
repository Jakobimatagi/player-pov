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

Studio is at http://127.0.0.1:54323 . The seeded team is **Demo Knights**. Local passwords are `password1234` for head coach `coach@demo.local` and player `player@demo.local`. Copy the API URL and anon key from `npx supabase status` into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Leave them unset to run the 3D viewer with no backend. Do not put the service-role key in `.env.local` or in any `VITE_` variable.

With no backend, http://127.0.0.1:5173/team shows the roster layout. `?roster=player` is the player view. A confirmed coach creates a team with `create_team`. Invites go through the `invite-member` edge function, which needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_URL` as function secrets. The service-role key stays out of Vercel and git.

## Hosting

Vercel Hobby and Supabase free tier are for an unpaid personal pilot. Hobby is non-commercial: move to Vercel Pro before charging a team. Move Supabase to Pro on the first paid team, the first missed keep-alive, or a database over 300 MB.

`vercel.json` rewrites every path to `index.html`. `keepalive.yml` calls `GET /rest/v1/rpc/health` every two days. `backup.yml` uploads an age-encrypted dump each night. The private age key stays offline. `deploy.yml` pushes migrations to staging, then waits for the GitHub `production` environment before production.
