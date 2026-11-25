/**
 * Turns a Hudl export into what the import saves: one play per clip number with its
 * breakdown fields and, per angle, the file's name, fingerprint and length. Then works out
 * which plays are already saved (same fingerprint), which are new, and which clash with a
 * saved play of the same number. Reads a few MiB per clip; video stays on the computer.
 */
import type { ExportFile } from './exportFiles'
import { readBreakdownXlsx } from './exportFiles'
import { fingerprintClip, readMp4DurationMs, type ClipFingerprint } from './clipFile'
import { playTags, type PlayTags } from './hudlBreakdown'
import { groupExport, type ExportGroups } from './hudlExport'

export interface ReadFile extends ClipFingerprint {
  angle: string
  fileName: string
  durationMs: number | null
}

export interface ReadPlay {
  playNumber: number
  /** Null when the breakdown has no row for this clip. */
  tags: PlayTags | null
  /** By angle, A to Z. */
  files: ReadFile[]
}

export interface ReadExport {
  groups: ExportGroups
  plays: ReadPlay[]
  /** Breakdown rows that share a PLAY # with an earlier row; the first row is used. */
  duplicateRows: number[]
  /** Breakdown rows with no usable PLAY #. */
  rowsWithoutNumber: number
}

export interface ReadProgress {
  done: number
  total: number
}

/** Runs tasks with at most `limit` at once, in order of the input. */
async function pool<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>) {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await run(items[i]!)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Reads the breakdown, groups the clips and fingerprints every clip file. `readDuration`
 * is the fallback for clips whose length is not in an MP4 header (the browser passes one
 * that asks a <video> element).
 */
export async function readExport(
  files: readonly ExportFile[],
  options: {
    onProgress?: (p: ReadProgress) => void
    readDuration?: (clip: Blob) => Promise<number | null>
  } = {},
): Promise<ReadExport> {
  const byName = new Map(files.map((f) => [f.name, f]))
  const names = files.map((f) => f.name)
  const sheetName = groupExport(names).breakdown
  const rows = sheetName ? await readBreakdownXlsx(await byName.get(sheetName)!.open()) : []

  const tagsByPlay = new Map<number, PlayTags>()
  const duplicateRows: number[] = []
  let rowsWithoutNumber = 0
  for (const row of rows) {
    const tags = playTags(row)
    if (tags.play_number == null) rowsWithoutNumber += 1
    else if (tagsByPlay.has(tags.play_number)) duplicateRows.push(tags.play_number)
    else tagsByPlay.set(tags.play_number, tags)
  }

  const groups = groupExport(names, sheetName ? tagsByPlay.keys() : null)
  const jobs = groups.plays.flatMap((play) =>
    Object.entries(play.angles).map(([angle, fileName]) => ({ play, angle, fileName })),
  )
  let done = 0
  options.onProgress?.({ done, total: jobs.length })
  const read = await pool(jobs, 4, async ({ angle, fileName }): Promise<ReadFile> => {
    const blob = await byName.get(fileName)!.open()
    const fingerprint = await fingerprintClip(blob)
    const durationMs =
      (await readMp4DurationMs(blob)) ?? (await options.readDuration?.(blob)) ?? null
    done += 1
    options.onProgress?.({ done, total: jobs.length })
    return { angle, fileName, durationMs, ...fingerprint }
  })

  let i = 0
  const plays = groups.plays.map((play) => {
    const count = Object.keys(play.angles).length
    const playFiles = read.slice(i, i + count)
    i += count
    return {
      playNumber: play.playNumber,
      tags: tagsByPlay.get(play.playNumber) ?? null,
      files: playFiles,
    }
  })
  return {
    groups,
    plays,
    duplicateRows: [...new Set(duplicateRows)].sort((a, b) => a - b),
    rowsWithoutNumber,
  }
}

// ---------------------------------------------------------------------------------------
// Matching against what is saved.

export interface SavedFile extends ClipFingerprint {
  angle: string
}

export interface SavedClip {
  id: string
  playNumber: number | null
  files: SavedFile[]
}

export interface ImportPlan {
  /** Not saved yet: a clip row and its files. */
  add: ReadPlay[]
  /** Already saved; `newFiles` are angles the saved clip doesn't have yet. */
  matched: { play: ReadPlay; clipId: string; newFiles: ReadFile[] }[]
  /** A saved clip has this play number but none of its files match. Left alone. */
  conflicts: { play: ReadPlay; clipId: string }[]
  /** No clip length could be read, so there is no time range to save. */
  unreadable: ReadPlay[]
}

const key = (f: ClipFingerprint) => `${f.size}:${f.sha256}`

export function planImport(plays: readonly ReadPlay[], saved: readonly SavedClip[]): ImportPlan {
  const byFingerprint = new Map<string, SavedClip>()
  const byNumber = new Map<number, SavedClip>()
  for (const clip of saved) {
    for (const f of clip.files) byFingerprint.set(key(f), clip)
    if (clip.playNumber != null) byNumber.set(clip.playNumber, clip)
  }
  const plan: ImportPlan = { add: [], matched: [], conflicts: [], unreadable: [] }
  for (const play of plays) {
    const hit = play.files.map((f) => byFingerprint.get(key(f))).find((c) => c != null)
    if (hit) {
      const angles = new Set(hit.files.map((f) => f.angle))
      plan.matched.push({
        play,
        clipId: hit.id,
        newFiles: play.files.filter((f) => !angles.has(f.angle)),
      })
    } else if (byNumber.has(play.playNumber)) {
      plan.conflicts.push({ play, clipId: byNumber.get(play.playNumber)!.id })
    } else if (playLengthMs(play) == null) {
      plan.unreadable.push(play)
    } else {
      plan.add.push(play)
    }
  }
  return plan
}

/** A play's clip range ends at its longest angle, capped at the table's 10 minutes. */
export function playLengthMs(play: ReadPlay): number | null {
  const lengths = play.files
    .map((f) => f.durationMs)
    .filter((ms): ms is number => ms != null && ms > 0)
  return lengths.length ? Math.min(Math.max(...lengths), 600_000) : null
}

/** The film that most of these saved files belong to. */
export function mostCommonFilm(hits: readonly { filmId: string }[]): string | null {
  const counts = new Map<string, number>()
  for (const h of hits) counts.set(h.filmId, (counts.get(h.filmId) ?? 0) + 1)
  let best: string | null = null
  for (const [id, n] of counts) if (best == null || n > counts.get(best)!) best = id
  return best
}
