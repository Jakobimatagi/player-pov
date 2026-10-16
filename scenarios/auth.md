# Auth

Sign-in is required once `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. With those unset, `/` stays the engine viewer so the earlier viewer scenarios still open. `/login`, `/signup`, `/forgot-password`, `/reset-password`, and `/accept-invite` always render.

A player joins only by opening `/accept-invite?token=<64 hex characters>` and then calling `public.accept_invite`. The page does not read `invites` or `memberships` before that call. `anon` has no table grants. The raw token is not a row id; the database stores its sha256.

The seeded player is `player@demo.local` / `password1234` (local seed only). Email confirmation is on in `supabase/config.toml`.

## Supabase Auth dashboard

Nothing in this file is applied to the hosted project. On Supabase **player-pov** (`bfaopibbbldsxvjprfdx`), before hosted login works:

1. Site URL: the Vercel production URL for player-pov.
2. Redirect URLs: `http://127.0.0.1:5173/**` and `https://<production-host>/**`. Preview mail, if you want it, is only `https://player-pov-*-<team-slug>.vercel.app/**` with this project's Vercel team slug. Do not allow `https://*.vercel.app/**`. If that preview pattern is not added, leave mail links off for preview deployments. Local `supabase/config.toml` already lists `http://127.0.0.1:5173/**`.
3. Email provider on. Confirm email on. No new OAuth providers.
4. Confirmation and recovery templates keep `{{ .ConfirmationURL }}`.
5. Do not send Supabase's invite-user mail as the join path. The link is `/accept-invite?token=<64 hex characters>`.
6. Exposed API schemas stay `public` and `graphql_public`. The app calls `public.accept_invite`. No new migration.

Migrations still waiting, in order: `supabase/migrations/20261015120000_identity.sql`, then `supabase/migrations/20261015130100_health.sql`, then `supabase/migrations/20261015140200_team.sql`. Do not run `supabase/seed.sql` on the host.

## Scenario 1 — Player login

**Preconditions:** Local Supabase is running with the seed. The dev server has the anon env vars.

**Steps:**

1. Open http://127.0.0.1:5173/login .
2. Enter `player@demo.local` and `password1234`. Click **Log in**.
3. Sign out, then sign in with the same email and `not-the-password`.

**Expected:**

- The correct password lands on a page titled `Player Home`.
- The wrong password shows `Email or password is incorrect` and does not say which field failed.

## Scenario 2 — Forgot password

**Preconditions:** Resend SMTP is configured on the Supabase project. Scenario 1's player exists.

**Steps:**

1. Open `/forgot-password`.
2. Submit `player@demo.local`.
3. Submit `nobody@demo.local`.
4. Open the message in the Resend log and set a new password on `/reset-password`.
5. Sign in with the old password, then the new one.

**Expected:**

- Both submits replace the form with `If that email has an account, a link is on its way`.
- The email arrives within a minute.
- The old password shows `Email or password is incorrect`. The new password reaches `Player Home`.

## Scenario 3 — Expired reset link

**Steps:**

1. Open http://127.0.0.1:5173/reset-password?error_code=otp_expired .

**Expected:**

- The page shows `This link has expired`.
- **Send a new one** goes to `/forgot-password`.

## Scenario 4 — Sign out

**Preconditions:** Signed in on two browsers, or one browser and a second session.

**Steps:**

1. Click the account avatar, then **Sign out**.
2. Press Back.
3. Sign in again. On the account menu choose **Sign out everywhere**. Refresh the other session.

**Expected:**

- After sign out the login page says `You're signed out.` Back does not show Player Home.
- The other session loses access on its next refresh, or within an hour when its access token expires.

## Scenario 5 — Watch route while logged out

**Preconditions:** The anon env vars are set. No session.

**Steps:**

1. Open http://127.0.0.1:5173/watch/00000000-0000-4000-8000-0000000000a1 .
2. Sign in as the seeded player.

**Expected:**

- The first open redirects to `/login?next=/watch/00000000-0000-4000-8000-0000000000a1`.
- After login the address is that watch path.

## Scenario 6 — Coach signup

**Steps:**

1. Open `/signup`. Enter a name, email, and a password of at least 10 characters. The form has no coach checkbox.
2. Open the confirmation email and confirm.
3. Sign in.

**Expected:**

- Before confirmation, sign-in shows `Confirm your email first` and a **Resend confirmation** control.
- After confirmation the account lands on `Create team`, with the sentence `Ask your coach for an invite`.

## Scenario 7 — Inactivity

**Preconditions:** Signed in. DevTools can edit localStorage.

**Steps:**

1. Set `last_active` to a timestamp more than 14 days ago.
2. Reload.

**Expected:**

- The app signs out and opens `/login?expired=1`.
- The banner reads `Session expired, sign in again.`

## Scenario 8 — Invite token

**Preconditions:** A 64-character hex invite token exists for an email. The dev server is running. This check does not require the hosted project.

**Steps:**

1. Open http://127.0.0.1:5173/accept-invite .
2. Open http://127.0.0.1:5173/accept-invite?token=abcd .
3. Open http://127.0.0.1:5173/accept-invite?token= followed by 64 hex characters, while logged out. Submit the invited email and a password of at least 10 characters.
4. Click **Log in**, sign in with an account whose email does not match the invite, then choose **Sign out and switch**.

**Expected:**

- Steps 1 and 2 show `This invite is no longer valid. Ask your coach for a new one, or log in.` The page does not ask for a password.
- Step 3 shows **Email**, **Password**, and **Confirm password**. The address bar drops `?token=` after the page loads. **Log in** goes to `/login` and carries the token in navigation state, not in `next=`. The confirmation mail still returns to `/accept-invite?token=<those 64 hex characters>`, and that page stashes the token and strips it from the address.
- A confirmed session calls `accept_invite` once, reloads the membership, and a matching invite lands on Player Home. That success removes `invite_token` from session storage. An unconfirmed email shows `Confirm your email first`.
- A signed-in email that does not match shows `You're signed in as <that email>.` and `This invite is for a different email.` **Sign out and switch** keeps the token. An invalid or expired invite removes `invite_token` and shows the invalid-invite sentence.
- The screen does not list invite rows or teammates. Signup has no coach checkbox and does not send a role.
