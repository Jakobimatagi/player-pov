/**
 * Saves a Hudl export read in the browser: a 'hudl_export' film row, one film_clips row
 * per play and a film_clip_files row per angle. Only metadata and fingerprints are sent;
 * there is no upload.
 */
import {
  mostCommonFilm,
  planImport,
  playLengthMs,
  type ImportPlan,
  type ReadExport,
  type ReadFile,
  type ReadPlay,
  type SavedClip,
} from '../film/hudlImport'
import type { Film } from './film'
import { supabase } from './supabase'

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

/** Rows per insert; keeps each request well under PostgREST's body limit. */
const BATCH = 100
/** Fingerprints per lookup; they go in the URL. */
const LOOKUP = 40

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface ExportGame {
  id: string
  title: string
  opponent: string | null
  gameDate: string | null
  clipCount: number
}

/** The team's Hudl export games, newest first, with how many plays each has. */
export async function listExportGames(teamId: string): Promise<ExportGame[]> {
  const { data, error } = await client()
    .from('film')
    .select('id, title, opponent, game_date, film_clips(count)')
    .eq('team_id', teamId)
    .eq('source', 'hudl_export')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    opponent: row.opponent,
    gameDate: row.game_date,
    clipCount: (row.film_clips as unknown as { count: number }[])[0]?.count ?? 0,
  }))
}

/** The saved game these clips came from, found by fingerprint, or null for a new export. */
export async function findExportGame(teamId: string, read: ReadExport): Promise<string | null> {
  const db = client()
  const files = read.plays.flatMap((p) => p.files)
  // A sample from across the game is enough to recognise it.
  const step = Math.max(1, Math.floor(files.length / LOOKUP))
  const sample = files.filter((_, i) => i % step === 0).slice(0, LOOKUP)
  if (sample.length === 0) return null
  const { data: hits, error } = await db
    .from('film_clip_files')
    .select('clip_id, size_bytes, sha256')
    .eq('team_id', teamId)
    .in(
      'sha256',
      sample.map((f) => f.sha256),
    )
  if (error) throw new Error(error.message)
  const sizes = new Map(sample.map((f) => [f.sha256, f.size]))
  const clipIds = (hits ?? [])
    .filter((h) => sizes.get(h.sha256) === h.size_bytes)
    .map((h) => h.clip_id)
  if (clipIds.length === 0) return null
  const { data: clips, error: clipError } = await db
    .from('film_clips')
    .select('film_id')
    .in('id', [...new Set(clipIds)])
  if (clipError) throw new Error(clipError.message)
  return mostCommonFilm((clips ?? []).map((c) => ({ filmId: c.film_id })))
}

/** Every clip on a game with its saved files. */
export async function loadSavedClips(filmId: string): Promise<SavedClip[]> {
  const db = client()
  const { data: clips, error } = await db
    .from('film_clips')
    .select('id, play_number')
    .eq('film_id', filmId)
  if (error) throw new Error(error.message)
  const byId = new Map<string, SavedClip>(
    (clips ?? []).map((c) => [c.id, { id: c.id, playNumber: c.play_number, files: [] }]),
  )
  for (const ids of chunks([...byId.keys()], BATCH)) {
    const { data: files, error: fileError } = await db
      .from('film_clip_files')
      .select('clip_id, angle, size_bytes, sha256')
      .in('clip_id', ids)
    if (fileError) throw new Error(fileError.message)
    for (const f of files ?? []) {
      byId.get(f.clip_id)?.files.push({ angle: f.angle, size: f.size_bytes, sha256: f.sha256 })
    }
  }
  return [...byId.values()]
}

export interface GameDetails {
  title: string
  opponent: string | null
  gameDate: string | null
}

export interface ImportResult {
  filmId: string
  /** True when the export matched a game already saved. */
  existing: boolean
  plan: ImportPlan
}

/** Looks the export up and works out what would change, without writing anything. */
export async function previewImport(
  teamId: string,
  read: ReadExport,
): Promise<{ filmId: string | null; plan: ImportPlan }> {
  const filmId = await findExportGame(teamId, read)
  const saved = filmId ? await loadSavedClips(filmId) : []
  return { filmId, plan: planImport(read.plays, saved) }
}

function clipRow(teamId: string, filmId: string, play: ReadPlay) {
  const t = play.tags
  return {
    team_id: teamId,
    film_id: filmId,
    play_number: play.playNumber,
    start_ms: 0,
    end_ms: playLengthMs(play)!,
    side: t?.side ?? null,
    quarter: t?.quarter ?? null,
    down: t?.down ?? null,
    distance: t?.distance ?? null,
    hash: t?.hash ?? null,
    yard_line: t?.yard_line ?? null,
    personnel: t?.personnel ?? null,
    formation: t?.formation ?? null,
    front: t?.front ?? null,
    coverage: t?.coverage ?? null,
    result: t?.result ?? null,
    gain_loss: t?.gain_loss ?? null,
    tags: t?.tags ?? {},
  }
}

const fileRow = (teamId: string, clipId: string, f: ReadFile) => ({
  clip_id: clipId,
  team_id: teamId,
  angle: f.angle,
  file_name: f.fileName.slice(0, 255),
  size_bytes: f.size,
  sha256: f.sha256,
})

/**
 * Saves the export. A game it matches is reused, and only plays and angles not saved yet
 * are added. Otherwise a new game is created with `details`.
 */
export async function saveImport(input: {
  teamId: string
  userId: string
  read: ReadExport
  details: GameDetails
  onProgress?: (saved: number, total: number) => void
}): Promise<ImportResult> {
  const db = client()
  const { teamId, read } = input
  let { filmId, plan } = await previewImport(teamId, read)
  const existing = filmId != null

  if (filmId == null) {
    const { data, error } = await db
      .from('film')
      .insert({
        team_id: teamId,
        title: input.details.title,
        opponent: input.details.opponent,
        game_date: input.details.gameDate,
        source: 'hudl_export',
        created_by: input.userId,
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '42501') throw new Error('Only coaches can add a game.')
      throw new Error(error.message)
    }
    filmId = data.id
    plan = planImport(read.plays, [])
  }

  const total = plan.add.length + plan.matched.filter((m) => m.newFiles.length > 0).length
  let saved = 0
  input.onProgress?.(saved, total)

  for (const batch of chunks(plan.add, BATCH)) {
    const { data, error } = await db
      .from('film_clips')
      .insert(batch.map((play) => clipRow(teamId, filmId!, play)))
      .select('id, play_number')
    if (error) throw new Error(error.message)
    const ids = new Map((data ?? []).map((c) => [c.play_number, c.id]))
    const files = batch.flatMap((play) =>
      play.files.map((f) => fileRow(teamId, ids.get(play.playNumber)!, f)),
    )
    const { error: fileError } = await db.from('film_clip_files').insert(files)
    if (fileError) throw new Error(fileError.message)
    saved += batch.length
    input.onProgress?.(saved, total)
  }

  const extra = plan.matched.filter((m) => m.newFiles.length > 0)
  for (const batch of chunks(extra, BATCH)) {
    const files = batch.flatMap((m) => m.newFiles.map((f) => fileRow(teamId, m.clipId, f)))
    const { error } = await db.from('film_clip_files').insert(files)
    if (error) throw new Error(error.message)
    saved += batch.length
    input.onProgress?.(saved, total)
  }

  return { filmId, existing, plan }
}

/** The film row for a saved game, for its title and date. */
export async function loadExportGame(
  filmId: string,
): Promise<Pick<Film, 'id' | 'title' | 'opponent' | 'gameDate'>> {
  const { data, error } = await client()
    .from('film')
    .select('id, title, opponent, game_date')
    .eq('id', filmId)
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id, title: data.title, opponent: data.opponent, gameDate: data.game_date }
}
