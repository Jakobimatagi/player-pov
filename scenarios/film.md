# Game film

A coach uploads one video file per game and marks plays on it (issue #59). A marked play is a **clip**: a start and end time on that one file, plus breakdown tags. Nothing is cut or stored per play.

| Piece          | Where                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| Tables and RLS | `supabase/migrations/20261207000000_film.sql`, checked by `supabase/tests/film.test.sql`      |
| Video storage  | A private Cloudflare R2 bucket, key `<team_id>/<film_id>/original`                            |
| Signed URLs    | Edge Function `supabase/functions/film-storage`                                               |
| Game film page | `/film` (`src/film/FilmPage.tsx`), in the coach nav under Playbook                            |
| Browser side   | `src/data/film.ts` (create, resumable upload, playback URL, delete), `src/film/uploadPlan.ts` |

The `/film` page adds, uploads, watches and deletes film. Play marking, the breakdown grid, Chart this play and the player clip view come later and get their scenarios here when they ship. Scenario 9 describes the Hudl export format, which is read in the browser and never uploaded. Scenario 10 is the `/chart` import that saves a game from an export without storing any video.

## Why R2

Supabase Free caps every uploaded file at 50 MB, and a game is 2 to 20 GB. R2 has no per-file cap that matters here, no egress fee (a whole team streaming the same game costs nothing extra), and a free tier of 10 GB stored, 1 million writes and 10 million reads a month. Supabase still holds every row and every access rule. The browser never sees R2 keys: the Edge Function asks the database (`public.film_object_allowed`, as the signed-in user) and then signs a URL that lasts an hour.

v1 does not transcode. The original file is what streams, using HTTP range requests, so a clip seeks without downloading the game. MP4 with H.264 plays in every browser. Exporting at 720p (about 1 GB an hour) keeps a team inside the free 10 GB.

## Limits

- One file is at most 20 GiB.
- A team holds at most `teams.film_quota_bytes` (10 GiB by default, R2's free tier), counted from each film's declared size. The function checks the stored file matches the declared size, and marks the film `failed` and deletes the file if not. Only the service role changes a quota.
- A film holds at most 500 clips, each at most 10 minutes, ending inside the film.
- Free tier is per Cloudflare account, not per team. Watch **R2 → Metrics** in the Cloudflare dashboard as teams are added.

## Who can do what

| Action                                              | Who                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Read film and clips                                 | Every coach on the team                                                            |
| Add, rename or refile a film                        | A coach with edit rights on its folder (side rules, or a scout task on the folder) |
| Upload the video                                    | Same, while the film is `uploading`                                                |
| Delete a film (video, then row and clips)           | Same, through the function only. Clients have no delete grant on `film`            |
| Set `ready` or `failed`, `proxy_key`, `duration_ms` | Service role only (the function, or a later transcode worker)                      |
| Mark, edit and delete clips                         | Every coach on the team                                                            |
| Read a clip, its film row and stream the film       | A player, only when the clip links to a published play assigned to them            |
| Anything on another team's film                     | Nobody                                                                             |
| Import a Hudl export game, delete it directly       | Same as adding a film; the clips never leave the coach's computer                  |
| Read clip file names and fingerprints               | Every coach on the team; never players                                             |

Known limit: a player allowed one clip can technically stream the whole game file, because a clip is a time range on it. The app only plays the clip range for them, and they still cannot list film or open any other film.

## One-time setup

The app owner does this; it is not automated.

1. In Cloudflare (free plan): **R2 → Create bucket**, name `player-pov-film`, location automatic. Leave public access off.
2. Bucket **Settings → CORS policy**:

   ```json
   [
     {
       "AllowedOrigins": ["https://<production domain>", "http://127.0.0.1:5173"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["content-type", "range"],
       "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   `ETag` must be exposed or resumable upload cannot finish.

3. Bucket **Settings → Object lifecycle rules**: keep the default "Abort incomplete multipart uploads after 7 days" so abandoned uploads stop counting against storage.
4. **R2 → Manage API tokens → Create API token**: Object Read & Write, this bucket only. Note the access key ID, the secret, and the account ID.
5. Set the function secrets and deploy it (deploys are not in CI):

   ```bash
   supabase secrets set --project-ref bfaopibbbldsxvjprfdx --env-file supabase/functions/.env
   ```

   ```bash
   supabase functions deploy film-storage --project-ref bfaopibbbldsxvjprfdx
   ```

`supabase/functions/.env` (not committed) holds `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME`. The keys live in Supabase only, not in Vercel: the browser build never needs them. Locally, use the same file and run `supabase functions serve film-storage --env-file supabase/functions/.env`.

## Scenario 1 — Add film to a pack week

**Preconditions:** A scout pack exists (`scenarios/scout-packs.md` Scenario 1). Signed in as the head coach or the DC.

**Steps:** Call `createFilm` (or insert a `film` row) with the pack's week folder, a title and `size_bytes = 4000000000`.

**Expected:**

- The row has `status = uploading`, `storage_key = <team_id>/<film_id>/original` and no `proxy_key`, whatever the client sent.
- As the OC, the same insert on a defense pack is refused (`You can only add film to a folder you can edit.`).
- A size over 20 GiB is refused (`one film file is at most 20 GiB`).
- With the team's quota below what is already used plus the new size, the insert is refused with `team film storage is full (<used> of <quota> bytes used)`.

## Scenario 2 — Upload, drop the connection, resume

**Preconditions:** Setup done. Scenario 1 done with a real MP4 of at least 100 MB, its size as `size_bytes`.

**Steps:**

1. Call `uploadFilm(filmId, file, { onProgress })`.
2. Partway through, turn off the network (DevTools → Network → Offline), then reload the page.
3. Turn the network back on and call `uploadFilm` again with the same film and file.

**Expected:**

- Progress resumes from the parts already stored, not from zero (the first `onProgress` call after the reload is above 0).
- When it finishes, the film is `ready` with `duration_ms` set and `proxy_key` equal to `storage_key`.
- In the Cloudflare dashboard the bucket holds one object at `<team_id>/<film_id>/original`.
- Uploading a `.avi` is refused (`Upload an MP4, MOV, M4V or WebM video`).
- Declaring the wrong `size_bytes` ends with `The uploaded file is not the size that was declared`, the film `failed`, and no object left in the bucket.

## Scenario 3 — Stream and seek

**Preconditions:** Scenario 2 done.

**Steps:** Call `filmPlaybackUrl(filmId)`, set the returned URL as a `<video>` source, and seek to 45:00.

**Expected:** The video plays within about a second of the seek. DevTools shows `206 Partial Content` responses with `Range` requests, not a full download. After an hour the URL stops working and a new call returns a fresh one.

## Scenario 4 — Mark plays

**Preconditions:** The film is `ready`.

**Steps:** As any coach, insert clips with `start_ms`, `end_ms`, and some of side, down, distance, formation and coverage.

**Expected:**

- Clips save. `end_ms` at or before `start_ms` is refused. `end_ms` past `duration_ms` is refused (`clip ends after the film does`).
- Linking a clip to another team's film, play or scout look is refused (foreign key violation).
- Moving a clip to another film is refused (`a clip stays on its film`).

## Scenario 5 — Player access

**Preconditions:** Scenario 4 done. One player has a published play assigned to them. Another has nothing assigned.

**Steps:**

1. As the first player, select from `film` and `film_clips`, and call `filmPlaybackUrl`.
2. As a coach, set one clip's `play_id` to the assigned play.
3. As the first player, repeat step 1.

**Expected:**

- Step 1 returns no rows, and `filmPlaybackUrl` fails with `Film not found`.
- Step 3 returns exactly that one clip and its film row, and `filmPlaybackUrl` returns a URL that plays.
- The player with nothing assigned still sees nothing and gets no URL.
- A player cannot insert or edit clips, and `deleteFilm` fails with `Not allowed`.

## Scenario 6 — Delete and other teams

**Preconditions:** Scenario 2 done.

**Steps:**

1. Signed in as Team B's head coach, select Team A's film and call `filmPlaybackUrl` and `deleteFilm` on it.
2. As Team A's head coach, call `deleteFilm(filmId)`.

**Expected:**

- Step 1: no rows, and both calls fail with `Film not found`.
- Step 2: the object is gone from the bucket (and any half-finished upload is aborted), then the film row and its clips are gone. A direct `delete from film` as a coach is refused (`permission denied`).

## Scenario 7 — Game film page, no backend

**Preconditions:** `VITE_SUPABASE_URL` unset. Open `/film`.

**Expected:**

- The coach nav shows **Game film** under Playbook, lit on this page.
- The note reads `Example film. Connect a backend and sign in as a coach to upload your own.`
- **Team film storage** reads `3.9 GB of 10 GB used` with a bar.
- **Add film** shows Video file, Title, Opponent, Game date and Scout pack week (`No scout packs yet`). **Upload film** is disabled.
- **Team film** lists Lincoln at Central and Week 11 vs Eastside as `Ready` with **Watch**, and Scrimmage end zone as `Upload not finished` with **Resume upload** and `Choose the same file (922 MB) to continue from where it stopped.`
- At 375px wide there is no sideways scroll, and every button is reachable.

## Scenario 8 — Upload from the page

**Preconditions:** Setup done and `film-storage` deployed. Signed in as the head coach on `/film`, locally (`localhost:5173`) or on production.

**Steps:**

1. Choose an MP4 of a few hundred MB. The title fills in from the file name. Pick a scout pack week.
2. Click **Upload film**. Partway through, click **Pause**, then **Resume**.
3. Start a second upload, reload the page partway, then click **Resume upload** on its row and choose the same file.

**Expected:**

- The progress bar reads `Uploading · <sent> of <total> · <n>%`, `Paused · …` after Pause, and climbs again from where it stopped after Resume.
- When done, the notice reads `<title> is ready to watch.`, the row shows `Ready`, and the storage bar grows by the file's size.
- After the reload, the row shows `Upload not finished`. Resuming with the same file continues from the stored parts; a different file shows `Choose the same file you started with (<size>).`
- **Watch** plays the video inline, and seeking jumps without a full download.
- The trash button asks first (`Delete for good`, `This removes the video and every play marked on it. It cannot be undone.`); confirming removes the row and frees the storage.
- A `.avi`, a file over 20 GB, or one bigger than the free storage is refused before anything uploads.
- Signed in as a player, `/film` sends you to Home.

## Scenario 9 — Hudl export format

Hudl clips are read in the coach's browser and never uploaded. Only the breakdown tags, and later the charted play, are saved. Each clip in an export is already one play, so nothing is joined or marked by time.

**Export format.** A zip holds:

- One video per play per angle, named `<Angle> - Clip <number>.mp4` (MOV and M4V also occur), for example `Wide - Clip 001.mp4` and `End Zone - Clip 001.mp4`. Leading zeros don't matter. An angle may be missing for some plays.
- `breakdown.xlsx`: one row per play. `PLAY #` equals the clip number.

**Breakdown columns** (`src/film/hudlBreakdown.ts`) fill the `film_clips` columns: `ODK` → side (O offense, D defense, K kick; any other letter is kept as the tag `odk`), `QTR`, `DN`, `DIST`, `HASH`, `YARD LN` (Hudl's -50 is stored as 50), `PERSONNEL`, `OFF FORM` → formation, `DEF FRONT` (else `MR FRONT`) → front, `COVERAGE` (else `MR COV (1)`) → coverage, `RESULT`, `GN/LS`. Every other filled column goes into `tags`, keyed in snake case and kept under 4 KB. A value the table's checks would refuse is left blank. The module takes the sheet's XML strings and has no Node-only imports, so it runs in the browser.

**Grouping** (`src/film/hudlExport.ts`) turns the export's file names into plays: clip number → each angle's file. It reports clips with no breakdown row, breakdown rows with no clip, and two files for the same angle and play. Hidden files and `__MACOSX` are skipped. It reads names only.

**Expected**, on the Mountain Ridge vs Corner Canyon export (205 Wide clips, 203 End Zone clips, 205 breakdown rows): 205 plays, angles End Zone and Wide, no clips without a row, no rows without a clip, no duplicates. Plays 45 and 95 have only Wide.

## Scenario 10 — Import a Hudl export on `/chart` (#98)

The coach opens **Chart plays** and drops the export zip or its folder (or uses **Choose zip** / **Choose folder**). Nothing video is uploaded. The browser reads the zip, groups the clips into plays, reads the breakdown, and saves only the game, each play's breakdown fields and each clip file's fingerprint.

**Reading the zip** (`src/film/zipReader.ts`) uses no library: the central directory is parsed from the end of the file and each entry is a slice of the picked `File`, so a stored clip costs nothing to open. Deflated entries (the xlsx parts, or a zip made with compression) are inflated with `DecompressionStream('deflate-raw')`. Zip64 is handled, so exports over 4 GB work. A dropped or picked folder skips the zip step. `src/film/exportFiles.ts` hides the difference and reads `breakdown.xlsx` (the first sheet the workbook lists, and the shared strings) with the same reader.

**Per clip** (`src/film/clipFile.ts`, `src/film/hudlImport.ts`), four at a time: the fingerprint is the size plus a SHA-256 of the first and last MiB (the whole file at 2 MiB or less), and the length comes from the MP4 movie header (`moov` → `mvhd`), found by walking the top-level box headers, so only a few KB beyond the fingerprint are read. A clip with no readable header falls back to a `<video>` element; one whose length still can't be read is listed and not saved.

**How it is stored** (migration `20261213000000_film_local_clips.sql`):

- The game is a `film` row with `source = 'hudl_export'` and `status = 'local'`, and no `size_bytes`, `storage_key` or `proxy_key`. It doesn't count toward the storage quota, never touches the film-storage function (which refuses it), and its editor deletes it directly; uploaded film still can't be deleted by a client. The storage columns stay until #104.
- Each play is one `film_clips` row. Because a play is its own file per angle, `start_ms`/`end_ms` are a time range **inside that play's clips**: 0 to the longest angle's length at import, which charting (#99) can trim. A local game holds each play number once.
- The clip files are rows of `film_clip_files`: clip, angle, path inside the export, size and SHA-256. We chose a table over a `clip_file` column because a play has a file per angle and later tracking (#100+) works per angle. Staff only; players never see file names.

**Re-opening the same export** looks up a sample of up to 40 fingerprints across the export, takes the game most of them belong to, then matches every play by fingerprint: a matched play is left alone (a new angle is added to it), a new play is added, and a play whose number is already saved from different clips is listed and left alone. A partly saved import finishes when the export is opened again.

**Shown on screen:** plays, clips and angles; clips with no breakdown row (saved with only their play number); breakdown rows with no clip (not saved); two files for one angle and play; breakdown rows that repeat a play number or have none; clips whose length couldn't be read; and, once checked against Supabase, whether the export is already saved and each play's status (Saved, New, Differs from saved).

**Expected**, on the 205-play test export (Wide for every play, End Zone missing on 45 and 95):

1. The first import creates one local game, 205 `film_clips` rows with the breakdown fields, and 408 `film_clip_files` rows, through RLS as a coach (`supabase/tests/film_local.test.sql`, `tests/hudl-import-save.test.ts`).
2. Opening the same zip again says it is already saved, shows every play as Saved, and writes nothing.
3. The devtools network tab shows no request carrying video bytes; the largest is a batch of 100 plays' metadata. Without a backend, reading the export makes no requests at all.

**Next:** chart each play beside its clip (#99).
