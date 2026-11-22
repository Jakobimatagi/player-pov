/** Pure helpers for resumable multipart film uploads. Mirrors the film-storage Edge Function. */

const MIB = 1024 * 1024

/** Accepted by the film-storage function. */
export const FILM_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm']

/** One file is at most 20 GiB (film.size_bytes check). */
export const FILM_MAX_BYTES = 20 * 1024 * MIB

/** Parts of at least 16 MiB, never more than 9,000. Every part but the last has this size. */
export function partSizeFor(sizeBytes: number): number {
  return Math.max(16 * MIB, Math.ceil(sizeBytes / 9000 / MIB) * MIB)
}

export interface PartRange {
  partNumber: number
  start: number
  end: number
}

/** Byte ranges for each part, numbered from 1. `end` is exclusive. */
export function planParts(sizeBytes: number, partSize: number): PartRange[] {
  if (sizeBytes <= 0 || partSize <= 0) return []
  const parts: PartRange[] = []
  for (let start = 0, n = 1; start < sizeBytes; start += partSize, n += 1) {
    parts.push({ partNumber: n, start, end: Math.min(start + partSize, sizeBytes) })
  }
  return parts
}

export interface DonePart {
  partNumber: number
  etag: string
  size: number
}

/** Parts still to send after a resume: anything not stored at its full size. */
export function remainingParts(plan: PartRange[], done: DonePart[]): PartRange[] {
  const stored = new Map(done.map((p) => [p.partNumber, p.size]))
  return plan.filter((p) => stored.get(p.partNumber) !== p.end - p.start)
}

/** Why a file can't be uploaded, or null when it can. */
export function fileProblem(
  file: { size: number; type: string },
  quotaLeft: number,
): string | null {
  if (!FILM_VIDEO_TYPES.includes(file.type)) return 'Upload an MP4, MOV, M4V or WebM video.'
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > FILM_MAX_BYTES) return 'One file can be at most 20 GB.'
  if (file.size > quotaLeft)
    return `Not enough team film storage left (${formatBytes(quotaLeft)} free).`
  return null
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
