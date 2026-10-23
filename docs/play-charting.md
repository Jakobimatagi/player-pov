# Play charting (2D editor → compiler → viewer)

Status: design, no code. Grounded on `main` after #24 and #25 (read 2026-10-15). It narrows v2-architecture.md §5 and V6, V7, V8 and V10 to a shippable editor that charts all 22 players.

## 0. What main has today (only what this doc depends on)

| Area | On main | Impact |
|---|---|---|
| Editor-source types | `src/play/sourceTypes.ts`: `PlaySource` (our side, `legs[]` unbounded), `LookSource` (the other side, `align` may be anchored), `Leg {to:{dx,dy}, dur?, speed?, interp?, face?, label?}` | The editor edits these types directly. No new source format. |
| Compiler | `compileSource(source, look, config) → {play, sourceMap, checksum, errors}` in `src/play/compileSource.ts`. **Imports `node:crypto`**. | It can't run in the browser as is. C2 fixes that. |
| Cap | `MAX_WAYPOINTS = 6` in `src/play/schema.ts`, enforced on the compiled `PlayFile` (`waypoints.min(1).max(6)`) | Raise it to 12. Each leg adds one waypoint, so the editor allows at most 11 legs per player. |
| Runtime | `CompiledPlay` is SoA with `wpStart: Uint16Array` | Variable-length already. A higher cap changes no layout. |
| Viewer | `/watch/:playId` → `WatchPage` → `<App/>`. **`App` ignores `playId`** and loads `usePlay(playUrlFromSearch(?play=))`. | It needs a source seam (C2). |
| Router | `src/app/router.tsx` (`createBrowserRouter`, react-router): `/`, auth pages, `/watch/:playId`, `/team` | Add routes in §3. |
| DB | `teams`, `profiles`, `memberships(team_id,user_id,role team_role,position)`, `invites`, `consent_records`. Helpers `app.my_role/is_member/is_staff/is_head_coach/is_owner`. **No plays/playbooks tables yet.** | C3 creates the v2 tables exactly as v2 §3 defines them. Nothing is reinvented. |
| Gfx budget | `tests/budget.test.ts`: total **3,854 triangles** (ceiling 6,000; blocky 160/body). `routeRibbon.ts` comment: "1,742 tris… 129 chords keep any play ≤2,000" (stale). | R1 is decided: at most 6,000 triangles and 10 meshes. |
| Route lines | `RouteLines`: one draw, debug toggle plus `QUALITY_LADDER` `routes` feature. `ROUTE_SEGMENT_CAP = 129` chords (258 triangles), stride-thinned above that. | See §0.1. |

### 0.1 Do longer routes affect the 3D budget?
- **Players, field and ball: no.** A waypoint is data only, in the SoA arrays (about 26 B/waypoint). At 22 × 12 waypoints that is about 7 KB. `samplePlayer` stays O(1) per player per frame because of `segmentCursor`.
- **Route ribbon: triangles are capped, not unbounded.** At 6 waypoints the ribbon has ≤110 chords. At 12 waypoints it can reach 242 raw chords, so the stride-2 thinning engages and the ribbon stays ≤129 chords (≤258 triangles). The ribbon is always one mesh. The only cost is coarser lines when routes are long; the triangle count does not grow.
- **Meshes: 6 with routes on, so ≤10 holds.** They are grass, markings, instanced bodies, instanced numbers, ball and ribbon. The editor itself is 2D SVG and adds zero GL meshes.
- Acceptance (C1): the budget test gets a `maxRoutes` case with 22 players × 12 waypoints. It asserts ribbon triangles ≤258 and meshes ≤10.

## 1. Types and signatures (`src/editor/`)

```ts
// state.ts
import type { PlaySource, LookSource, Leg, SourcePlayer, LookPlayer } from '../play/sourceTypes'
export const MAX_LEGS = 11                      // = MAX_WAYPOINTS(12) - 1
export const GRID = { coarse: 1, fine: 0.5 }    // yards; the fine grid is held by a modifier or a 2-finger hold
export type SideKey = 'ours' | 'theirs'         // ours = PlaySource.side, theirs = LookSource
export interface PlayerRef { side: SideKey; slot: string }
export interface LegRef extends PlayerRef { leg: number }   // -1 = alignment point
export type Tool = 'select' | 'route' | 'assign'            // assign = block/man/zone tag on a leg via Leg.label
export interface EditorState {
  playId: string | null; baseVersion: number | null         // for expected_version
  name: string
  source: PlaySource                                        // 11 of ours
  look: LookSource                                          // 11 of theirs (opponent)
  lookId: string | null; lookBaseVersion: number | null
  selection: PlayerRef | LegRef | null
  tool: Tool; snap: keyof typeof GRID | 'off'
  dirty: boolean
  past: EditorSnapshot[]; future: EditorSnapshot[]          // undo cap 50
  issues: EditorIssue[]                                     // last compile errors mapped by sourceMap
}
export type EditorSnapshot = Pick<EditorState, 'source' | 'look' | 'name'>
export interface EditorIssue { ref: PlayerRef | LegRef | null; message: string }

// actions.ts
export type EditorAction =
  | { type: 'load'; source: PlaySource; look: LookSource; playId: string | null; baseVersion: number | null; lookId: string | null; lookBaseVersion: number | null }
  | { type: 'rename'; name: string }
  | { type: 'select'; target: PlayerRef | LegRef | null }
  | { type: 'setTool'; tool: Tool } | { type: 'setSnap'; snap: EditorState['snap'] }
  | { type: 'moveAlign'; ref: PlayerRef; dx: number; dy: number }          // ball-relative, snapped
  | { type: 'addLeg'; ref: PlayerRef; to: { dx: number; dy: number }; at?: number } // rejected past MAX_LEGS
  | { type: 'moveLeg'; ref: LegRef; to: { dx: number; dy: number } }
  | { type: 'setLeg'; ref: LegRef; patch: Partial<Omit<Leg, 'to'>> }      // dur|speed, interp, face, label
  | { type: 'removeLeg'; ref: LegRef }
  | { type: 'setPlayer'; ref: PlayerRef; patch: Partial<Pick<SourcePlayer, 'position' | 'jersey' | 'role'>> }
  | { type: 'applyFormation'; side: SideKey; preset: string }
  | { type: 'setBall'; ball: PlaySource['ball'] }
  | { type: 'compiled'; issues: EditorIssue[] }
  | { type: 'saved'; baseVersion: number; lookBaseVersion: number | null }
  | { type: 'undo' } | { type: 'redo' }
  | { type: 'beginDrag' } | { type: 'endDrag' }                           // one undo entry per drag
export function editorReducer(s: EditorState, a: EditorAction): EditorState  // pure, no I/O
export function snapYards(v: number, snap: EditorState['snap']): number
export function legPoints(p: SourcePlayer | LookPlayer, ball: { x: number; y: number }): { x: number; y: number }[] // absolute yards

// hitTest.ts. Pure functions. Screen ↔ field mapping comes from the SVG viewBox.
export interface View { scale: number /* px per yard */; originX: number; originY: number; rotate: 0 | 90 } // 90 = portrait tablet
export const HIT_RADIUS_PX = 22                          // 44px target diameter, independent of zoom
export type Hit = { kind: 'player'; ref: PlayerRef } | { kind: 'waypoint'; ref: LegRef } | { kind: 'segment'; ref: LegRef; t: number } | { kind: 'field'; x: number; y: number }
export function screenToField(px: number, py: number, v: View): { x: number; y: number }
export function fieldToScreen(x: number, y: number, v: View): { px: number; py: number }
export function hitTest(s: EditorState, px: number, py: number, v: View): Hit  // priority: waypoint > player > segment > field
// Pointer Events only (pointerdown/move/up + setPointerCapture). touch-action: none on the SVG.

// compileAdapter.ts
import type { CompiledPlay, PlayFile, PlayLoadError } from '../play/types'
export interface ChartCompile { play: PlayFile | null; compiled: CompiledPlay | null; errors: PlayLoadError[]; issues: EditorIssue[] }
export function compileChart(source: PlaySource, look: LookSource): ChartCompile  // sync: compileSource → schema validate → buildCompiledPlay. No checksum.
export function checksumSource(source: PlaySource | LookSource): Promise<string>    // WebCrypto SHA-256 of canonical JSON. Matches node playChecksum.

// data/plays.ts (anon key and RLS only; the service role never ships)
export interface PlayRow { id: string; team_id: string; name: string; side: 'offense' | 'defense'; current_version: number | null; default_look_id: string | null; updated_at: string }
export function listPlays(teamId: string, playbookId?: string): Promise<PlayRow[]>
export function loadPlay(playId: string, version?: number): Promise<{ row: PlayRow; source: PlaySource; compiled: PlayFile; version: number; look: { id: string; version: number; source: LookSource } | null }>
export function savePlay(input: { teamId: string; playId: string | null; expectedVersion: number | null; name: string; source: PlaySource; look: { id: string | null; expectedVersion: number | null; source: LookSource } }): Promise<{ playId: string; version: number; lookId: string; lookVersion: number }> // throws StaleVersionError (409)
export function renamePlay(playId: string, name: string): Promise<void>
export function deletePlay(playId: string): Promise<void>            // soft delete: archived_at = now()
export function listPlaybooks(teamId: string): Promise<{ id: string; name: string; playCount: number }[]>
export function addToPlaybook(playbookId: string, playId: string, sort?: number): Promise<void>
export class StaleVersionError extends Error { current: number }

// viewer seam (src/play/usePlay.ts gains a source union)
export type PlayInput = { kind: 'url'; url: string } | { kind: 'id'; playId: string; version?: number } | { kind: 'draft'; key: string }
export function usePlayInput(i: PlayInput): ReturnType<typeof usePlay>
```

Draft hand-off: the editor writes `{source, look}` to `sessionStorage['draft:'+key]`. The viewer compiles it with `compileChart`, so there is one compiler path.

## 2. Migration and RLS outline (`supabase/migrations/20261023010000_plays.sql`)

These are v2 §3's tables, with the columns this feature needs. C3 includes `assignments` and `assignment_targets` (playbook path, no `package_id`). `scout_packages`, `scout_package_looks`, `player_slots`, `assignments.package_id`, and `assignment_targets.package_id` are C3b, stacked on C3. Watch tables stay later. C4 stacks on C3 and does not include C3b.

```sql
create table public.plays (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  name text not null check (length(name) between 1 and 80),
  side text not null default 'offense' check (side in ('offense','defense')),
  formation text, tags text[] not null default '{}',
  default_look_id uuid,                         -- FK added after scout_looks
  current_version int, archived_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.play_versions (
  play_id uuid references public.plays on delete cascade, version int not null,
  source jsonb not null, compiled jsonb not null,
  source_schema smallint not null, compiled_schema smallint not null,
  compiler_version text not null, checksum text not null,
  created_by uuid references auth.users, created_at timestamptz not null default now(),
  primary key (play_id, version));
create table public.scout_looks (... v2 §3 ...);  create table public.scout_look_versions (... v2 §3 ...);
alter table public.plays add foreign key (default_look_id) references public.scout_looks on delete set null;
create table public.playbooks (... v2 §3 ...);    create table public.playbook_plays (... v2 §3 ...);
create index on public.plays (team_id) where archived_at is null;

alter table public.plays enable row level security;   -- likewise for every table above
-- read: staff see all; players see what app.can_view_play allows (v2: assigned plays)
create function app.can_view_play(p uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plays pl where pl.id = p and pl.archived_at is null
    and (app.is_staff(pl.team_id) or (app.is_member(pl.team_id) and /* v2 assignment join */ true)))
$$;
create policy plays_select on public.plays for select to authenticated using (app.can_view_play(id) or app.is_staff(team_id));
create policy plays_update on public.plays for update to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));   -- rename, archive
-- no insert/delete policy: create via RPC; "delete" = archived_at
create policy pv_select on public.play_versions for select to authenticated using (app.can_view_play(play_id));
-- no insert/update/delete on versions: immutable, written only by the RPC
-- Dev Lead: keep the linked look. is_member would leak every look. C3b adds the assigned-package path.
create policy looks_select on public.scout_looks for select to authenticated using (
  app.is_staff(team_id)
  or exists (
    select 1 from public.plays pl
    where pl.default_look_id = scout_looks.id and app.can_view_play(pl.id)));
create policy looks_write  on public.scout_looks for update to authenticated using (app.is_staff(team_id)) with check (app.is_staff(team_id));
-- Dev Lead: playbooks are staff, or a player assigned to that playbook. Not every member.
create policy pb_select on public.playbooks for select to authenticated using (
  app.is_staff(team_id)
  or exists (
    select 1 from public.assignment_targets at
    where at.playbook_id = playbooks.id and at.user_id = auth.uid()));
create policy pb_write  on public.playbooks for all to authenticated using (app.is_staff(team_id)) with check (app.is_staff(team_id));
create policy pbp_select on public.playbook_plays for select to authenticated using (
  exists (
    select 1 from public.playbooks b
    where b.id = playbook_id
      and (app.is_staff(b.team_id) or app.can_view_play(play_id))));
create policy pbp_write  on public.playbook_plays for all to authenticated using (exists (select 1 from public.playbooks b where b.id = playbook_id and app.is_staff(b.team_id))) with check (exists (select 1 from public.playbooks b where b.id = playbook_id and app.is_staff(b.team_id)));

create function public.save_play_version(p_team uuid, p_play uuid, p_expected int, p_name text,
  p_source jsonb, p_compiled jsonb, p_checksum text, p_compiler text,
  p_look uuid, p_look_expected int, p_look_source jsonb, p_look_checksum text)
returns table (play_id uuid, version int, look_id uuid, look_version int)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff(p_team) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- upsert plays row; lock it with FOR UPDATE; if current_version is distinct from p_expected then raise using errcode = 'PT409'
  -- same for the look; insert both versions; bump current_version; update updated_at
  -- guard: jsonb_array_length of any player's waypoints <= 12
  -- octet_length of p_source, p_compiled, and p_look_source each < 64 KB
  -- p_checksum and p_look_checksum must match ^[0-9a-f]{64}$; the server does not recompute them
end $$;
revoke all on function public.save_play_version(...) from public, anon; grant execute on function public.save_play_version(...) to authenticated;
```

Dev Lead, recorded here so this section matches `20261023010000_plays.sql`:

2. `looks_select` stays staff, or the `default_look_id` of a play the caller can view. C3b extends it so an assigned player can also read looks in a package assigned to them.
3. Playbooks stay visible only to staff or to players assigned to them.
4. A player `UPDATE` that changes 0 rows is accepted. Postgres does not raise. The playbook screen shows the word `forbidden`.
5. Table default privileges grant every privilege to `anon`, `authenticated`, and `service_role`. The migration revokes those from `public`, `anon`, and `authenticated`, then grants back the subset for each table. `anon` gets nothing. New `app` functions get an explicit `grant execute` to `authenticated` and `service_role`. `app.guard_assignment` and `app.guard_playbook_play` are trigger-only: `authenticated` has no `EXECUTE`.

`plays_select` is `can_view_play(id) or is_staff(team_id)`, so staff still see an archived play and can clear `archived_at`. `can_view_play` itself still requires `archived_at is null`, and its assignment join requires `assignment_targets.team_id = plays.team_id`, so an assigned player does not see an archived play or another team's play filed into a book. `pb_select` keeps staff on the `is_staff` branch, including archived playbooks, and the assigned-player branch also requires `archived_at is null`. `playbook_plays` rejects a play whose team differs from the book's (`23514`). `scout_looks` has `unique (team_id, id)`, and `plays (team_id, default_look_id)` references that pair, so a default look cannot point at another team. `looks_select` and `lv_select` also require `look.team_id = plays.team_id` on the linked-play branch. `UPDATE` grants are column grants: on `plays` those columns are `name`, `formation`, `tags`, and `archived_at`. `team_id`, `created_by`, and the version columns are written only by `save_play_version`. A stale save raises `PT409`, which PostgREST turns into HTTP 409.

The checksum stored by `save_play_version` is a client integrity hint and is not verified. The server checks that each checksum matches `^[0-9a-f]{64}$` and does not recompute it. `p_source`, `p_compiled`, and `p_look_source` are each rejected at 64KB.

Tests: pgTAP `supabase/tests/plays.test.sql` in the style of `team.test.sql`. `scripts/check-rls.sql` fails when a new public table has RLS off, and when a public view other than `roster_public` lacks `security_invoker=true`.

## 3. Routes and screens

| Route | Screen | Who |
|---|---|---|
| `/playbook` | Play list: search, playbook filter, row actions **Watch · Edit play · Rename · Delete**, plus a **New play** FAB | Staff get all actions. Players get Watch only (rows they can view). |
| `/plays/new` | Editor with a formation preset (Trips Rt vs Cover 2 from fixtures) | Staff |
| `/plays/:playId/edit` | Editor loaded at `current_version` (see layout below) | Staff. Non-staff are redirected to `/watch/:playId`. |
| `/watch/:playId` | The existing viewer, now really loading by id (`PlayInput {kind:'id'}`) | Members who pass `can_view_play` |
| `/watch/draft/:key` | Viewer on the unsaved chart from the editor; the HUD shows a **Back to editor** chip | Staff |

Editor layout:
- Landscape: field SVG on the left, a side panel (player, legs, timing, issues) on the right.
- Portrait tablet: the panel becomes a bottom sheet and the field rotates 90°, offense moving up.
- The top bar holds Undo, Redo, Snap, **Preview 3D** and **Save**.

Where **Edit play** appears (staff only; `snap.role in ('head_coach','coach')` hides it for players, and RLS enforces the rule anyway):
1. **Inside the viewer HUD.** A top-right 44px button next to `route-toggle` → `/plays/:playId/edit?t=<heldT>`. The editor's timeline opens at that t.
2. On each `/playbook` row, and on the play's overflow menu.
3. On `/watch/draft/:key` it reads "Back to editor" instead.

Leaving the editor with `dirty` set shows a confirm. Players at `/plays/:id/edit` get a redirect, not a 403 page.

Interaction rules:
- Pointer Events only. Snap to the 1 yd grid by default, 0.5 yd fine, or off.
- Drag a player to move its alignment. The ball and LOS stay fixed.
- In the Route tool, tap the field to append a waypoint and drag a waypoint to move it.
- Long-press (500 ms) a waypoint to open its menu: delete, linear/smooth, face, label.
- Every target is ≥44px no matter how far you zoom. Pinch zoom goes 1×–4×.
- Pointer move work is limited to one `requestAnimationFrame` per frame.
- Inside the 10-yard band the hit test favors the nearer player.

## 4. PR split (each ships its scenarios/*.md in the README format; scenarios are appended, never renumbered)

| PR | Scope | Scenarios | Acceptance |
|---|---|---|---|
| **C1** Cap 12 | `MAX_WAYPOINTS=12`; update `schema.json`, `validate.py` parity, the stale `routeRibbon` comment, plus a budget test case for 22×12 | `scenarios/waypoint-cap.md` (12 OK, 13 rejected with a path error, long routes thin without growing triangles) | Schema and parity tests pass. Ribbon ≤258 triangles; ≤10 meshes. The Celeron frame-time check is NOT RUN. QA's headless proxy measured 16.7 ms median and p95, capped at 60 Hz. |
| **C2** Browser compile and viewer seam | Move the `node:crypto` checksum out of `compileSource`. Add `compileChart` and WebCrypto `checksumSource`. Add `usePlayInput` and make `/watch/:playId` honor the id (via a fixture map until C3). Add `/watch/draft/:key`. | Append to `play-compile.md`; `play-loading.md` (load by id, draft, bad key) | `scan-bundle` finds no `node:` imports. The browser checksum equals the node checksum on all fixtures. Existing `?play=` URLs still work. |
| **C3** Plays schema and RLS | The §2 migration, down migration, pgTAP and check-rls | `scenarios/playbook-data.md` (coach writes; player write denied; other team invisible; 409 on a stale version; staff still sees an archived play) | pgTAP is green in CI. A player insert fails with 42501. A player update changes 0 rows. Two saves with the same `expected` produce one success and one PT409. |
| **C3b** Scout packages | `scout_packages`, `scout_package_looks`, `player_slots`, `assignments.package_id`, `assignment_targets.package_id`, and the package path on `looks_select`. Stacked on C3. | `scenarios/scout-packages.md` | A player reads looks in an assigned package and nothing from an unassigned package or another team. |
| **C4** Data access and Playbook screen | `src/data/plays.ts`, `/playbook` list, rename, delete (archive), playbook filter. Stacked on C3, not on C3b. | `scenarios/playbook.md` | List, rename and delete round-trip on a seeded team. Player view has no write controls. A rejected player write shows `forbidden`. 44px rows on 360px wide. |
| **C5** Editor core (pure) | `state.ts`, `actions.ts`, `hitTest.ts`, a read-only `EditorCanvas.tsx` that renders all 22 players plus routes | `scenarios/editor.md` (1–N: render, select, undo) | Reducer unit tests cover every action. `MAX_LEGS` is enforced. `hitTest` honors the 44px radius at every zoom. Snapshot render of the fixture. |
| **C6** Editor interaction | Pointer drag, snap, add/move/delete waypoints, long-press menu, leg timing panel, formation presets, portrait rotation | Append to `editor.md`; `touch.md` (tablet drag, pinch, no page scroll) | All edits work with touch only on an iPad-size viewport and a Chromebook. Snapping lands on whole and half yards. Drags hold 60fps (SVG). |
| **C7** Save, preview and Edit play entry | Save via RPC (with a 409 → "Reload / Save as copy" dialog), Preview 3D through `compileChart` into `/watch/draft`, the **Edit play** button in the viewer HUD and the list, plus role gating | `scenarios/edit-play.md` | From any play the coach reaches the editor in 1 tap, both from the viewer and from the list. Chart → Save → Watch shows the same tracks (checksum match). Players never see Edit play, and the URL redirects them. |

Order: C1 → C2 → C3 → C3b and C4 in parallel, both on C3 → C5 → C6 → C7. Each PR is independently revertable.

## 5. Risks and open questions (5)

R1: Option A (≤6,000 triangles, ≤10 meshes), conditional on a real Celeron frame-time measurement before release (NOT RUN).

All five are resolved by Dev Lead's decisions above: R1 option A (≤6,000 triangles, ≤10 meshes), R2 assigned plays only, R3 linked scout look, R4 per-position default speed plus a simple ball step, R5 Reload or Save as copy.
