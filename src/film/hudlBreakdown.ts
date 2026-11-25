/**
 * Reads a Hudl breakdown.xlsx into `film_clips` columns: one row per play, keyed by
 * PLAY # (the clip number in the export). Pure and browser-safe: it takes the sheet's XML
 * strings, so the caller decides how to unzip the .xlsx.
 */
import type { FilmSide } from '../data/database.types'

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
