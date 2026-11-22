# Game film

A coach uploads one video file per game and marks plays on it (issue #59). A marked play is a **clip**: a start and end time on that one file, plus breakdown tags. Nothing is cut or stored per play. Data and access rules live in `supabase/migrations/20261207000000_film.sql`; the pgTAP checks are `supabase/tests/film.test.sql`.

This pass is the data layer only: tables, access rules, the storage bucket and limits. Upload, the film player, play marking, the breakdown grid, Chart this play and the player clip view come in later passes and get their scenarios here when they ship. Until then, run these checks in Supabase Studio (SQL editor, with **Role** set to a signed-in user) or through `supabase test db`.

Where things live:

| Thing    | Where                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------- |
| Film row | `public.film`: team, folder (usually a scout pack week), title, opponent, game date, size, status |
| Clip     | `public.film_clips`: film, play number, `start_ms`, `end_ms`, side, down, distance, tags, links   |
| Original | Storage bucket `film`, key `<team_id>/<film_id>/original`. Set by the database, not the client    |
| Proxy    | `<team_id>/<film_id>/proxy.mp4`, 720p faststart, written by the video worker (service role)       |
| Thumbs   | `<team_id>/<film_id>/thumbs/...`, written by the video worker                                     |

Who can do what:

| Action                                              | Who                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Read film and clips                                 | Every coach on the team                                                            |
| Add, rename, refile or delete a film                | A coach with edit rights on its folder (side rules, or a scout task on the folder) |
| Upload the original                                 | Same, once, while the film is `uploading`                                          |
| Mark the upload finished (`uploading → processing`) | Same                                                                               |
| Set `ready` or `failed`, the proxy and the length   | The video worker only                                                              |
| Mark, edit and delete clips                         | Every coach on the team                                                            |
| Read a clip, its film row, proxy and thumbnails     | A player, only when the clip is linked to a published play assigned to them        |
| Read the original                                   | Coaches only                                                                       |
| Anything on another team's film                     | Nobody                                                                             |

Limits: one file is at most 20 GiB. A team holds at most `teams.film_quota_bytes` of film (200 GiB by default), counted from each film's declared size. A film holds at most 500 clips, each at most 10 minutes long and ending inside the film once its length is known.

Known limit: a player who may watch one clip can technically fetch the whole proxy file, because a clip is a time range on it, not a separate file. The app only ever plays the clip range for them, and they still cannot see the film list or any other film.

## Scenario 1 — Add film to a pack week

**Preconditions:** A scout pack exists (`scenarios/scout-packs.md` Scenario 1). Signed in as the head coach or the DC.

**Steps:** Insert a `film` row with the pack's week folder, a title and `size_bytes = 4000000000`.

**Expected:**

- The row has `status = uploading`, `storage_key = <team_id>/<film_id>/original` and no `proxy_key`, whatever the client sent.
- As the OC, the same insert on a defense pack is refused (`new row violates row-level security policy`).
- `size_bytes` over 21474836480 (20 GiB) is refused.
- With the team's quota set below what is already used plus the new size, the insert is refused with `team film storage is full (<used> of <quota> bytes used)`.

## Scenario 2 — Upload rules

**Preconditions:** Scenario 1 done.

**Steps:** As the uploader, upload a file to `film/<team_id>/<film_id>/original`. Then try `.../proxy.mp4`, and a key under Team B's id.

**Expected:**

- The original uploads. The proxy and the other team's key are refused.
- After setting `status = processing`, uploading to the film again is refused.
- Setting `status = ready` or `proxy_key` as a coach is refused (`only the video worker sets the proxy and duration`, `a coach only marks an upload as finished`).

## Scenario 3 — Mark plays

**Preconditions:** The film is `ready` with a `duration_ms` (set by the worker, or by hand as the service role).

**Steps:** As any coach, insert clips with `start_ms`, `end_ms`, and some of side, down, distance, formation and coverage.

**Expected:**

- Clips save. `end_ms` equal to or before `start_ms` is refused. `end_ms` past `duration_ms` is refused (`clip ends after the film does`).
- Linking a clip to another team's film, play or scout look is refused (foreign key violation).
- Moving a clip to another film is refused (`a clip stays on its film`).
- Deleting the film deletes its clips.

## Scenario 4 — Player access

**Preconditions:** Scenario 3 done. A player has a published play assigned to them. Another player has nothing assigned.

**Steps:**

1. As the player, select from `film` and `film_clips`.
2. As a coach, set one clip's `play_id` to the assigned play.
3. As the player, select again, and request a signed URL for the proxy and for the original.

**Expected:**

- Step 1 returns no rows.
- Step 3 returns exactly that one clip and its film row. The proxy signed URL works. The original is refused.
- The player with nothing assigned still sees no film, no clips and cannot read the proxy.
- A player cannot insert or edit clips.

## Scenario 5 — Other team

**Preconditions:** Team A has film and clips.

**Steps:** Signed in as Team B's head coach, select from `film`, `film_clips`, and request Team A's object keys.

**Expected:** No rows, and every Team A key is refused.
