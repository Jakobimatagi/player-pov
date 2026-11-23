# Auth

Sign-in is required once `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. With those unset, `/` stays the engine viewer so the earlier viewer scenarios still open. `/login`, `/signup`, `/forgot-password`, `/reset-password`, and `/accept-invite` always render.

The seeded player is `player@demo.local` / `password1234` (local seed only). Email confirmation is on in `supabase/config.toml`.

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

1. Open `/signup`. Enter a name, email, and a password of at least 10 characters. Leave **I'm a coach creating a team** checked.
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

## Branded auth emails

The sign-up confirmation, magic link, password reset and invite emails say Scheme HQ. The HTML lives in `supabase/templates/` and the subjects in `supabase/config.toml` (`[auth.email.template.*]`).

| Email           | Subject                                    | File                                   | Sent by                                        |
| --------------- | ------------------------------------------ | -------------------------------------- | ---------------------------------------------- |
| Confirm sign up | `Confirm your email for Scheme HQ`         | `supabase/templates/confirmation.html` | `/signup`, **Resend confirmation**             |
| Magic link      | `Your Scheme HQ sign-in link`              | `supabase/templates/magic_link.html`   | Not used by the app today; branded in case     |
| Reset password  | `Reset your Scheme HQ password`            | `supabase/templates/recovery.html`     | `/forgot-password`                             |
| Invite user     | `You're invited to your team on Scheme HQ` | `supabase/templates/invite.html`       | Edge Function `invite-member` (new and resend) |

**Local.** The local stack reads the templates when it starts. After changing one, run `supabase stop` then `supabase start` (no `db reset` needed). Mail lands in Mailpit at http://127.0.0.1:54324 .

**Hosted project (by hand).** `config.toml` does not reach the hosted project unless someone runs `supabase config push`, which also pushes every other auth setting, so paste the templates in the dashboard instead:

1. Supabase Dashboard → project **player-pov** → **Authentication → Emails** (called **Email Templates** on older dashboards).
2. For each of **Confirm sign up**, **Magic link**, **Reset password** and **Invite user**:
   1. Set **Subject** to the subject in the table above.
   2. Switch the body to **Source** and replace it with the whole file from the table above, copied from `main`.
   3. Click **Save changes**.
3. Leave the other templates (change email address, reauthentication) on Supabase's defaults for now.
4. **Sender name.** Emails go out through Resend SMTP. Open **Authentication → Emails → SMTP Settings** and set **Sender name** to `Scheme HQ`. If custom SMTP were ever turned off, the default Supabase mailer sends as "Supabase Auth" and cannot be renamed, so keep custom SMTP on.
5. Send yourself a password reset from https://www.schemehq.app/forgot-password and check the subject, the sender name, and that the button opens `/reset-password`.

## Scenario 8 — Branded reset email (local)

**Preconditions:** Local stack started after this change. Seeded player exists.

**Steps:**

1. Open http://127.0.0.1:5173/forgot-password and submit `player@demo.local`.
2. Open Mailpit at http://127.0.0.1:54324 .

**Expected:**

- The newest message's subject is `Reset your Scheme HQ password`.
- The body shows the `SCHEME HQ` wordmark, an orange **Set a new password** button, and no mention of Supabase.
- The button opens `/reset-password` and lets the player set a new password.
