/** Wording for the /chart import screen. Pure, so it is tested without a browser. */
import type { ImportPlan, ReadExport, ReadPlay } from './hudlImport'

const SIDE: Record<string, string> = {
  offense: 'O',
  defense: 'D',
  kick: 'K',
  special: 'K',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "1, 2, 3 and 4", or the first eight and how many more. */
export function listNumbers(numbers: readonly number[], max = 8): string {
  const shown = numbers.slice(0, max).map(String)
  const more = numbers.length - shown.length
  if (more > 0) return `${shown.join(', ')} and ${more} more`
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

export function describeRead(
  read: ReadExport,
  plan: ImportPlan | null,
): { headline: string; problems: string[] } {
  const { groups } = read
  const clips = read.plays.reduce((n, p) => n + p.files.length, 0)
  const headline = `${plural(read.plays.length, 'play')} · ${plural(clips, 'clip')} · ${
    groups.angles.length ? groups.angles.join(', ') : 'no angles'
  }`
  const problems: string[] = []
  if (!groups.breakdown) problems.push('No breakdown.xlsx in the export, so plays have no tags.')
  if (groups.clipsWithoutRow.length)
    problems.push(
      `${plural(groups.clipsWithoutRow.length, 'clip')} with no breakdown row: play ${listNumbers(groups.clipsWithoutRow)}.`,
    )
  if (groups.rowsWithoutClip.length)
    problems.push(
      `${plural(groups.rowsWithoutClip.length, 'breakdown row')} with no clip: play ${listNumbers(groups.rowsWithoutClip)}. These are not saved.`,
    )
  for (const d of groups.duplicates)
    problems.push(
      `Play ${d.playNumber} has ${d.fileNames.length} ${d.angle} clips; using ${d.fileNames[0]}.`,
    )
  if (read.duplicateRows.length)
    problems.push(
      `The breakdown lists play ${listNumbers(read.duplicateRows)} more than once; the first row is used.`,
    )
  if (read.rowsWithoutNumber)
    problems.push(
      `${plural(read.rowsWithoutNumber, 'breakdown row')} without a PLAY # were skipped.`,
    )
  if (plan?.conflicts.length)
    problems.push(
      `Play ${listNumbers(plan.conflicts.map((c) => c.play.playNumber))} is already saved from different clips and was left as it is.`,
    )
  if (plan?.unreadable.length)
    problems.push(
      `Could not read the length of play ${listNumbers(plan.unreadable.map((p) => p.playNumber))}; these are not saved.`,
    )
  return { headline, problems }
}

export type PlayStatus = 'saved' | 'new' | 'clash' | 'unreadable'

export function playStatus(play: ReadPlay, plan: ImportPlan): PlayStatus {
  if (plan.matched.some((m) => m.play === play)) return 'saved'
  if (plan.conflicts.some((c) => c.play === play)) return 'clash'
  if (plan.unreadable.includes(play)) return 'unreadable'
  return 'new'
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th']

/** One table row: "O · Q1 · 2nd & 7 · -25", the formation, and the angles. */
export function playSummary(play: ReadPlay): {
  situation: string
  formation: string
  angles: string
} {
  const t = play.tags
  const situation = t
    ? [
        t.side ? SIDE[t.side] : t.tags.odk,
        t.quarter ? `Q${t.quarter}` : null,
        t.down ? `${ORDINAL[t.down]} & ${t.distance ?? '?'}` : null,
        t.yard_line != null ? String(t.yard_line) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  return {
    situation,
    formation: t?.formation ?? '',
    angles: play.files.map((f) => f.angle).join(', '),
  }
}
