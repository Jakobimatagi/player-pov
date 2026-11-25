import {
  partSizeFor,
  planParts,
  remainingParts,
  type DonePart,
  type PartRange,
} from '../film/uploadPlan'
import type { FilmSource, FilmStatus } from './database.types'
import { supabase } from './supabase'

/** A game film row, as the app uses it. */
export interface Film {
  id: string
  teamId: string
  folderId: string | null
  title: string
  opponent: string | null
  gameDate: string | null
  /** 'hudl_export' games keep their clips on the coach's computer. */
  source: FilmSource
  /** Null for a Hudl export game, which stores no file. */
  sizeBytes: number | null
  durationMs: number | null
  status: FilmStatus
  createdAt: string
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

const FILM_COLUMNS =
  'id, team_id, folder_id, title, opponent, game_date, source, size_bytes, duration_ms, status, created_at'

function asFilm(row: {
  id: string
  team_id: string
  folder_id: string | null
  title: string
  opponent: string | null
  game_date: string | null
  source: FilmSource
  size_bytes: number | null
  duration_ms: number | null
  status: FilmStatus
  created_at: string
}): Film {
  return {
    id: row.id,
    teamId: row.team_id,
    folderId: row.folder_id,
    title: row.title,
    opponent: row.opponent,
    gameDate: row.game_date,
    source: row.source,
    sizeBytes: row.size_bytes,
    durationMs: row.duration_ms,
    status: row.status,
    createdAt: row.created_at,
  }
}

async function callStorage<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke('film-storage', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = context ? await context.json().catch(() => null) : null
    throw new Error((detail as { error?: string } | null)?.error ?? error.message)
  }
  return data as T
}

/** Film on the team, newest first. Staff see all; players see none through this list. */
export async function listFilm(teamId: string): Promise<Film[]> {
  const { data, error } = await client()
    .from('film')
    .select(FILM_COLUMNS)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(asFilm)
}

/** Bytes of film the team holds, and its quota. */
export async function filmUsage(teamId: string): Promise<{ used: number; quota: number }> {
  const db = client()
  const [{ data: team, error: teamError }, { data: rows, error: filmError }] = await Promise.all([
    db.from('teams').select('film_quota_bytes').eq('id', teamId).single(),
    db.from('film').select('size_bytes').eq('team_id', teamId),
  ])
  if (teamError) throw new Error(teamError.message)
  if (filmError) throw new Error(filmError.message)
  return {
    used: (rows ?? []).reduce((sum, r) => sum + (r.size_bytes ?? 0), 0),
    quota: team.film_quota_bytes,
  }
}

/** Adds the film row. The upload itself is uploadFilm. */
export async function createFilm(input: {
  teamId: string
  folderId: string | null
  title: string
  opponent: string | null
  gameDate: string | null
  sizeBytes: number
  userId: string
}): Promise<Film> {
  const { data, error } = await client()
    .from('film')
    .insert({
      team_id: input.teamId,
      folder_id: input.folderId,
      title: input.title,
      opponent: input.opponent,
      game_date: input.gameDate,
      size_bytes: input.sizeBytes,
      created_by: input.userId,
    })
    .select(FILM_COLUMNS)
    .single()
  if (error) {
    if (error.code === '42501') throw new Error('You can only add film to a folder you can edit.')
    throw new Error(error.message)
  }
  return asFilm(data)
}

/** Reads the video length from the local file, before upload. */
export function readDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const src = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(src)
      if (Number.isFinite(video.duration) && video.duration > 0) {
        resolve(Math.round(video.duration * 1000))
      } else {
        reject(new Error('Could not read the length of that video.'))
      }
    }
    video.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error('This browser cannot read that video. Try an MP4 (H.264).'))
    }
    video.src = src
  })
}

const resumeKey = (filmId: string) => `film-upload:${filmId}`

function savedUpload(filmId: string): string | null {
  try {
    return localStorage.getItem(resumeKey(filmId))
  } catch {
    return null
  }
}

function saveUpload(filmId: string, uploadId: string | null) {
  try {
    if (uploadId) localStorage.setItem(resumeKey(filmId), uploadId)
    else localStorage.removeItem(resumeKey(filmId))
  } catch {
    // Without storage the upload still works; it just restarts after a reload.
  }
}

async function putPart(url: string, blob: Blob, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, { method: 'PUT', body: blob, signal })
      if (!res.ok) throw new Error(`Part upload failed (${res.status})`)
      const etag = res.headers.get('ETag')
      if (!etag) throw new Error('Storage did not return an ETag. Check the bucket CORS rules.')
      return etag
    } catch (err) {
      if (signal?.aborted || attempt >= 4) throw err
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
}

/**
 * Uploads the file for a film in parts, three at a time. If the page reloads or the
 * network drops, calling it again with the same film and file resumes from the parts
 * already stored.
 */
export async function uploadFilm(
  filmId: string,
  file: File,
  options: {
    onProgress?: (sentBytes: number, totalBytes: number) => void
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const durationMs = await readDurationMs(file)
  let uploadId = savedUpload(filmId)
  // The function uses the same rule; parts must all match it but the last.
  const partSize = partSizeFor(file.size)
  let done: DonePart[] = []

  if (uploadId) {
    const listed = await callStorage<{ parts: DonePart[]; expired?: boolean }>({
      action: 'list-parts',
      filmId,
      uploadId,
    }).catch(() => ({ parts: [], expired: true }))
    if (listed.expired) uploadId = null
    else done = listed.parts
  }
  if (!uploadId) {
    const started = await callStorage<{ uploadId: string }>({
      action: 'start',
      filmId,
      contentType: file.type,
    })
    uploadId = started.uploadId
    saveUpload(filmId, uploadId)
  }

  const plan = planParts(file.size, partSize)
  const todo = remainingParts(plan, done)
  const finished = new Map(done.map((p) => [p.partNumber, p.etag]))
  let sent = plan.filter((p) => !todo.includes(p)).reduce((sum, p) => sum + (p.end - p.start), 0)
  options.onProgress?.(sent, file.size)

  // Sign up to 100 parts at a time; signed URLs last an hour.
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100)
    const { urls } = await callStorage<{ urls: Record<number, string> }>({
      action: 'sign-parts',
      filmId,
      uploadId,
      partNumbers: batch.map((p) => p.partNumber),
    })
    const queue: PartRange[] = [...batch]
    const worker = async () => {
      for (let part = queue.shift(); part; part = queue.shift()) {
        const url = urls[part.partNumber]
        if (!url) throw new Error('Storage did not sign every part')
        const etag = await putPart(url, file.slice(part.start, part.end), options.signal)
        finished.set(part.partNumber, etag)
        sent += part.end - part.start
        options.onProgress?.(sent, file.size)
      }
    }
    await Promise.all([worker(), worker(), worker()])
  }

  await callStorage({
    action: 'complete',
    filmId,
    uploadId,
    durationMs,
    parts: plan.map((p) => ({ partNumber: p.partNumber, etag: finished.get(p.partNumber) ?? '' })),
  })
  saveUpload(filmId, null)
}

/** A signed URL to stream the film, good for an hour. Players get one only for film behind an assigned play. */
export async function filmPlaybackUrl(filmId: string): Promise<{ url: string; expiresAt: string }> {
  return callStorage({ action: 'read', filmId })
}

/** Deletes the video from storage, then the film row and its clips. */
export async function deleteFilm(filmId: string): Promise<void> {
  await callStorage({ action: 'delete', filmId })
  saveUpload(filmId, null)
}

/** Deletes a Hudl export game and its clips. Nothing is stored, so no function is involved. */
export async function deleteLocalFilm(filmId: string): Promise<void> {
  const { error } = await client().from('film').delete().eq('id', filmId)
  if (error) throw new Error(error.message)
}

/** A scout pack week folder film can be filed in. */
export interface PackWeek {
  id: string
  name: string
  opponent: string | null
}

/** Live scout pack weeks on the team, newest first, with the opponent folder's name. */
export async function listPackWeeks(teamId: string): Promise<PackWeek[]> {
  const db = client()
  const { data, error } = await db
    .from('playbooks')
    .select('id, name, parent_id, pack_week')
    .eq('team_id', teamId)
    .is('archived_at', null)
    .not('pack_week', 'is', null)
    .order('pack_week', { ascending: false })
  if (error) throw new Error(error.message)
  const weeks = data ?? []
  const parentIds = [...new Set(weeks.map((w) => w.parent_id).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  if (parentIds.length > 0) {
    const { data: parents, error: parentError } = await db
      .from('playbooks')
      .select('id, name')
      .in('id', parentIds)
    if (parentError) throw new Error(parentError.message)
    for (const p of parents ?? []) names.set(p.id, p.name)
  }
  return weeks.map((w) => ({
    id: w.id,
    name: w.name,
    opponent: w.parent_id ? (names.get(w.parent_id) ?? null) : null,
  }))
}
