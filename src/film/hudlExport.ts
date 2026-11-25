/**
 * Groups the files of a Hudl export into plays. An export holds one clip per play per
 * angle ("Wide - Clip 001.mp4", "End Zone - Clip 001.mp4") and a breakdown.xlsx whose
 * PLAY # matches the clip number. Works on names only; nothing here reads a zip or video.
 */

export interface ClipName {
  angle: string
  playNumber: number
}

export interface ExportPlay {
  playNumber: number
  /** Angle → file name, e.g. { Wide: 'Wide - Clip 007.mp4' }. */
  angles: Record<string, string>
}

export interface DuplicateClip {
  angle: string
  playNumber: number
  /** Every file for that angle and play. The first one is the one used. */
  fileNames: string[]
}

export interface ExportGroups {
  /** By clip number, lowest first. */
  plays: ExportPlay[]
  /** Angle names, A to Z. */
  angles: string[]
  /** The breakdown spreadsheet, or null when the export has none. */
  breakdown: string | null
  /** Clip numbers with no breakdown row. Empty when no breakdown play numbers were given. */
  clipsWithoutRow: number[]
  /** Breakdown play numbers with no clip on any angle. */
  rowsWithoutClip: number[]
  duplicates: DuplicateClip[]
  /** Files that are neither a clip nor the breakdown (a second .xlsx lands here too). */
  ignored: string[]
}

/** "Wide - Clip 007.mp4" → { angle: "Wide", playNumber: 7 }. Folders in the path are ignored. */
export function parseClipName(name: string): ClipName | null {
  const base = name.split(/[\\/]/).pop() ?? ''
  const m = /^(.+?)\s*-\s*Clip\s+0*(\d+)\.(mp4|mov|m4v)$/i.exec(base)
  if (!m || !m[1] || !m[2]) return null
  const playNumber = Number(m[2])
  if (playNumber < 1) return null
  return { angle: m[1].trim(), playNumber }
}

/** macOS zip clutter and hidden files, which never count as part of the export. */
function isJunk(name: string): boolean {
  const parts = name.split(/[\\/]/)
  return parts.includes('__MACOSX') || parts.some((p) => p.startsWith('.')) || name.endsWith('/')
}

const byNumber = (a: number, b: number) => a - b

/**
 * Groups clip file names into plays. Pass the breakdown's play numbers (PLAY # of each row)
 * to also report clips with no row and rows with no clip.
 */
export function groupExport(
  fileNames: readonly string[],
  breakdownPlayNumbers: Iterable<number> | null = null,
): ExportGroups {
  const files = new Map<number, Map<string, string[]>>()
  const angles = new Set<string>()
  const sheets: string[] = []
  const ignored: string[] = []

  for (const name of [...fileNames].sort()) {
    if (isJunk(name)) continue
    const clip = parseClipName(name)
    if (clip) {
      angles.add(clip.angle)
      const perAngle = files.get(clip.playNumber) ?? new Map<string, string[]>()
      perAngle.set(clip.angle, [...(perAngle.get(clip.angle) ?? []), name])
      files.set(clip.playNumber, perAngle)
    } else if (/\.xlsx$/i.test(name)) {
      sheets.push(name)
    } else {
      ignored.push(name)
    }
  }

  const plays: ExportPlay[] = []
  const duplicates: DuplicateClip[] = []
  for (const playNumber of [...files.keys()].sort(byNumber)) {
    const out: Record<string, string> = {}
    for (const [angle, names] of [...files.get(playNumber)!].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      out[angle] = names[0]!
      if (names.length > 1) duplicates.push({ angle, playNumber, fileNames: names })
    }
    plays.push({ playNumber, angles: out })
  }

  const rows = breakdownPlayNumbers == null ? null : new Set(breakdownPlayNumbers)
  return {
    plays,
    angles: [...angles].sort((a, b) => a.localeCompare(b)),
    breakdown: sheets[0] ?? null,
    clipsWithoutRow: rows ? plays.map((p) => p.playNumber).filter((n) => !rows.has(n)) : [],
    rowsWithoutClip: rows ? [...rows].filter((n) => !files.has(n)).sort(byNumber) : [],
    duplicates,
    ignored: [...sheets.slice(1), ...ignored],
  }
}
