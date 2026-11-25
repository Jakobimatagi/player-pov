/**
 * Turns a Hudl-style game export (one clip per play plus a breakdown spreadsheet) into a
 * plays file: every play's start and end on one joined game video, with its breakdown
 * tags in the shape of `film_clips`. Pure, so the CLI (hudlCli.ts) and /film share it.
 */
import { z } from 'zod'
import type { FilmSide } from '../data/database.types'
import { formatDuration } from './filmView'

// ---------------------------------------------------------------------------------------
// Reading breakdown.xlsx. An .xlsx is a zip; the caller unzips sheet1 and sharedStrings.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code] ?? whole
  })
}

/** Text of every <t> inside a fragment, joined (rich text splits a string into runs). */
function textRuns(xml: string): string {
  let out = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1] ?? ''
  return decodeXml(out)
}

/** "A" → 0, "AB" → 27. */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Cells of the first worksheet as rows of strings, blank cells as ''. Cells are placed by
 * their reference (B3), so skipped blanks don't shift later columns.
 */
export function readSheet(sheetXml: string, sharedStringsXml: string | null): string[][] {
  const shared: string[] = []
  if (sharedStringsXml) {
    for (const m of sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g))
      shared.push(textRuns(m[1] ?? ''))
  }
  const rows: string[][] = []
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const cell of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? ''
      const body = cell[2] ?? ''
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const type = /\bt="(\w+)"/.exec(attrs)?.[1]
      const col = ref ? columnIndex(ref) : row.length
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let value = ''
      if (type === 's' && raw != null) value = shared[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = textRuns(body)
      else if (raw != null) value = decodeXml(raw)
      while (row.length < col) row.push('')
      row[col] = value.trim()
    }
    rows.push(row)
  }
  return rows
}

/** Rows keyed by the header row. Blank cells are left out. */
export function breakdownRows(table: string[][]): Record<string, string>[] {
  const [header, ...body] = table
  if (!header) return []
  return body
    .map((row) => {
      const out: Record<string, string> = {}
      header.forEach((name, i) => {
        const value = row[i]
        if (name && value) out[name] = value
      })
      return out
    })
    .filter((row) => Object.keys(row).length > 0)
}

// ---------------------------------------------------------------------------------------
// One breakdown row → the film_clips columns.

export interface PlayTags {
  play_number: number | null
  side: FilmSide | null
  quarter: number | null
  down: number | null
  distance: number | null
  hash: 'L' | 'M' | 'R' | null
  yard_line: number | null
  personnel: string | null
  formation: string | null
  front: string | null
  coverage: string | null
  result: string | null
  gain_loss: number | null
  tags: Record<string, string>
}

const SIDES: Record<string, FilmSide> = { O: 'offense', D: 'defense', K: 'kick' }

/** Columns that fill a film_clips column, first match wins. Everything else goes to tags. */
const MAPPED = {
  play_number: ['PLAY #'],
  side: ['ODK'],
  quarter: ['QTR'],
  down: ['DN'],
  distance: ['DIST'],
  hash: ['HASH'],
  yard_line: ['YARD LN'],
  personnel: ['PERSONNEL'],
  formation: ['OFF FORM'],
  front: ['DEF FRONT', 'MR FRONT'],
  coverage: ['COVERAGE', 'MR COV (1)'],
  result: ['RESULT'],
  gain_loss: ['GN/LS'],
} as const

/** Room for tags; film_clips.tags is at most 4 KB. */
const TAGS_MAX_BYTES = 4000

function pick(row: Record<string, string>, names: readonly string[]): string | undefined {
  for (const n of names) if (row[n]) return row[n]
  return undefined
}

function int(value: string | undefined, min: number, max: number): number | null {
  if (value == null || !/^-?\d+$/.test(value)) return null
  const n = Number(value)
  return n >= min && n <= max ? n : null
}

const text = (value: string | undefined) => (value ? value.slice(0, 40) : null)

/** "OFF STR" → "off_str", "MR COV (1)" → "mr_cov_1". */
export function tagKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export function playTags(row: Record<string, string>): PlayTags {
  const yard = int(pick(row, MAPPED.yard_line), -50, 50)
  const hash = pick(row, MAPPED.hash)?.toUpperCase()
  const used = new Set<string>()
  for (const names of Object.values(MAPPED)) {
    const hit = names.find((n) => row[n])
    if (hit) used.add(hit)
  }
  const tags: Record<string, string> = {}
  let bytes = 2
  for (const [header, value] of Object.entries(row)) {
    if (used.has(header)) continue
    const key = tagKey(header)
    if (!key || key in tags) continue
    const v = value.slice(0, 200)
    const cost = new TextEncoder().encode(JSON.stringify(key) + JSON.stringify(v)).length + 2
    if (bytes + cost > TAGS_MAX_BYTES) break
    tags[key] = v
    bytes += cost
  }
  const odk = pick(row, MAPPED.side)?.toUpperCase()
  if (odk && !SIDES[odk]) tags.odk = odk
  return {
    play_number: int(pick(row, MAPPED.play_number), 1, 999),
    side: odk ? (SIDES[odk] ?? null) : null,
    quarter: int(pick(row, MAPPED.quarter), 1, 5),
    down: int(pick(row, MAPPED.down), 1, 4),
    distance: int(pick(row, MAPPED.distance), 0, 99),
    hash: hash === 'L' || hash === 'M' || hash === 'R' ? hash : null,
    // Hudl writes midfield as 50 or -50; film_clips keeps it as 50.
    yard_line: yard === -50 ? 50 : yard,
    personnel: text(pick(row, MAPPED.personnel)),
    formation: text(pick(row, MAPPED.formation)),
    front: text(pick(row, MAPPED.front)),
    coverage: text(pick(row, MAPPED.coverage)),
    result: text(pick(row, MAPPED.result)),
    gain_loss: int(pick(row, MAPPED.gain_loss), -99, 99),
    tags,
  }
}

// ---------------------------------------------------------------------------------------
// Clips joined end to end → each play's place on the game video.

export interface ClipLength {
  playNumber: number
  durationMs: number
}

export interface Span {
  playNumber: number
  startMs: number
  endMs: number
}

/** Back-to-back spans in the order given, the way the clips are joined. */
export function timeline(clips: ClipLength[]): Span[] {
  let at = 0
  return clips.map((c) => {
    const span = { playNumber: c.playNumber, startMs: at, endMs: at + c.durationMs }
    at = span.endMs
    return span
  })
}

/** "Wide - Clip 007.mp4" → { angle: "Wide", playNumber: 7 }. */
export function parseClipName(name: string): { angle: string; playNumber: number } | null {
  const m = /^(.+?)\s*-\s*Clip\s+0*(\d+)\.(mp4|mov|m4v)$/i.exec(name)
  if (!m || !m[1] || !m[2]) return null
  return { angle: m[1].trim(), playNumber: Number(m[2]) }
}

// ---------------------------------------------------------------------------------------
// The plays file: what the CLI writes next to each joined video and /film imports.

const MAX_CLIP_MS = 600_000

const playSchema = z.object({
  play_number: z.number().int().min(1).max(999).nullable(),
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(1),
  side: z.enum(['offense', 'defense', 'special', 'kick']).nullable(),
  quarter: z.number().int().min(1).max(5).nullable(),
  down: z.number().int().min(1).max(4).nullable(),
  distance: z.number().int().min(0).max(99).nullable(),
  hash: z.enum(['L', 'M', 'R']).nullable(),
  yard_line: z.number().int().min(-49).max(50).nullable(),
  personnel: z.string().max(40).nullable(),
  formation: z.string().max(40).nullable(),
  front: z.string().max(40).nullable(),
  coverage: z.string().max(40).nullable(),
  result: z.string().max(40).nullable(),
  gain_loss: z.number().int().min(-99).max(99).nullable(),
  tags: z.record(z.string(), z.string()),
})

const playsFileSchema = z.object({
  format: z.literal('scheme-hq-plays'),
  version: z.literal(1),
  source: z.string().max(40),
  title: z.string().max(200),
  angle: z.string().max(40).nullable(),
  durationMs: z.number().int().positive(),
  plays: z.array(playSchema).min(1).max(500),
})

export type PlayClip = z.infer<typeof playSchema>
export type PlaysFile = z.infer<typeof playsFileSchema>

export interface BuildResult {
  file: PlaysFile
  /** Breakdown rows with no clip on this angle. */
  missing: number[]
}

export function buildPlaysFile(input: {
  title: string
  angle: string | null
  clips: ClipLength[]
  rows: Record<string, string>[]
}): BuildResult {
  const byNumber = new Map<number, PlayTags>()
  for (const row of input.rows) {
    const tags = playTags(row)
    if (tags.play_number != null) byNumber.set(tags.play_number, tags)
  }
  const spans = timeline(input.clips)
  const plays: PlayClip[] = spans.map((s) => {
    const tags = byNumber.get(s.playNumber)
    return {
      ...(tags ?? playTags({})),
      play_number: s.playNumber,
      start_ms: s.startMs,
      end_ms: Math.max(s.startMs + 1, Math.min(s.endMs, s.startMs + MAX_CLIP_MS)),
    }
  })
  const onFilm = new Set(spans.map((s) => s.playNumber))
  return {
    file: {
      format: 'scheme-hq-plays',
      version: 1,
      source: 'hudl',
      title: input.title,
      angle: input.angle,
      durationMs: spans.at(-1)?.endMs ?? 0,
      plays,
    },
    missing: [...byNumber.keys()].filter((n) => !onFilm.has(n)).sort((a, b) => a - b),
  }
}

/** Reads a plays file, or says what is wrong with it. */
export function parsePlaysFile(
  json: unknown,
): { ok: true; file: PlaysFile } | { ok: false; error: string } {
  const parsed = playsFileSchema.safeParse(json)
  if (parsed.success) return { ok: true, file: parsed.data }
  if ((json as { format?: unknown } | null)?.format !== 'scheme-hq-plays') {
    return {
      ok: false,
      error: 'That is not a plays file. Choose the .plays.json made with the video.',
    }
  }
  const issue = parsed.error.issues[0]
  return {
    ok: false,
    error: `This plays file has a problem at ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? 'invalid'}.`,
  }
}

/** How far the joined video and the uploaded film may differ before the import is refused. */
export const DURATION_SLACK_MS = 3000

/**
 * The plays to insert on a film, ends kept inside the film. Refuses a file made for a
 * video of a different length (a different angle or a different game).
 */
export function playsForFilm(
  file: PlaysFile,
  filmDurationMs: number | null,
): { ok: true; plays: PlayClip[] } | { ok: false; error: string } {
  if (filmDurationMs == null)
    return { ok: false, error: 'This film has no length yet. Finish the upload first.' }
  if (Math.abs(file.durationMs - filmDurationMs) > DURATION_SLACK_MS) {
    return {
      ok: false,
      error: `These plays are for a ${formatDuration(file.durationMs)} video, and this film is ${formatDuration(filmDurationMs)}. Check you chose the plays file for this angle.`,
    }
  }
  const plays = file.plays
    .filter((p) => p.start_ms < filmDurationMs)
    .map((p) => ({ ...p, end_ms: Math.min(p.end_ms, filmDurationMs) }))
  return { ok: true, plays }
}

/** "1st & 10 · DOUBLES · KINGS / FIRE". Empty parts are dropped. */
export function playSummary(
  p: Pick<PlayClip, 'down' | 'distance' | 'formation' | 'front' | 'coverage'>,
): string {
  const ord = ['', '1st', '2nd', '3rd', '4th']
  const dd = p.down ? `${ord[p.down]} & ${p.distance ?? '?'}` : null
  const d = [p.front, p.coverage].filter(Boolean).join(' / ') || null
  return [dd, p.formation, d].filter(Boolean).join(' · ')
}
