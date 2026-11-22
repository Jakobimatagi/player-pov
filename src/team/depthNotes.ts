import { slotDisplay } from './depthSlots'

/** Longest note body, matching the depth_notes check. */
export const NOTE_MAX = 1000

/** A coach note on a roster player, as staff see it. */
export interface DepthNote {
  id: string
  rosterPlayerId: string
  /** A note about one depth chart position, or null for a general note. */
  slot: string | null
  body: string
  /** The player can read it. Off by default. */
  shared: boolean
  /** When the player could first read this version; null while staff-only. */
  sharedAt: string | null
  createdBy: string | null
  authorName: string
  createdAt: string
  updatedAt: string
}

/** A shared note as the player reads it. */
export interface MyDepthNote {
  id: string
  slot: string | null
  body: string
  authorName: string
  createdAt: string
  updatedAt: string
  sharedAt: string | null
}

export interface MyDepthSpot {
  slot: string
  rank: number
  /** How many players are listed at this position. */
  depth: number
}

export const LABEL_SHARED = 'Shared with player'
export const LABEL_PRIVATE = 'Private (staff only)'
export const SHARE_WARNING = 'The player can read this.'

export function noteLabel(note: Pick<DepthNote, 'shared'>): string {
  return note.shared ? LABEL_SHARED : LABEL_PRIVATE
}

/** Trimmed body, or an error message for a blank or too-long note. */
export function checkNoteBody(
  raw: string,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim()
  if (body === '') return { ok: false, error: 'Write a note first' }
  if (body.length > NOTE_MAX) {
    return { ok: false, error: `Keep it under ${NOTE_MAX} characters (${body.length} now)` }
  }
  return { ok: true, body }
}

/** Notes grouped by roster player, oldest first in each list. */
export function notesByPlayer(notes: readonly DepthNote[]): Map<string, DepthNote[]> {
  const out = new Map<string, DepthNote[]>()
  for (const note of [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const list = out.get(note.rosterPlayerId)
    if (list == null) out.set(note.rosterPlayerId, [note])
    else list.push(note)
  }
  return out
}

/** One line of a note body for previews, cut at a word where it can be. */
export function previewText(body: string, max = 60): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export interface NoteSummary {
  count: number
  shared: number
  private: number
  /** The most recent note, or null. */
  last: DepthNote | null
}

export function summarizeNotes(notes: readonly DepthNote[] | undefined): NoteSummary {
  const list = notes ?? []
  const shared = list.filter((note) => note.shared).length
  let last: DepthNote | null = null
  for (const note of list) {
    if (last == null || note.createdAt > last.createdAt) last = note
  }
  return { count: list.length, shared, private: list.length - shared, last }
}

/** Short count for the notes control: "No notes", "1 note", "3 notes". */
export function countText(count: number): string {
  if (count === 0) return 'No notes'
  return `${count} ${count === 1 ? 'note' : 'notes'}`
}

/** The author or the head coach edits, shares and deletes a note. */
export function canChangeNote(
  note: Pick<DepthNote, 'createdBy'>,
  me: { userId: string | null; headCoach: boolean },
): boolean {
  return me.headCoach || (me.userId != null && note.createdBy === me.userId)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** "Today", "Yesterday", "Nov 3", or "Nov 3, 2025" for another year. Local time. */
export function formatNoteDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  if (sameDay(date, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return 'Yesterday'
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`
  return date.getFullYear() === now.getFullYear() ? day : `${day}, ${date.getFullYear()}`
}

/** "edited" marker when the body changed well after it was written. */
export function wasEdited(note: Pick<DepthNote, 'createdAt' | 'updatedAt'>): boolean {
  return new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000
}

/** "Starter", "2nd string", "3rd string", "4th string"… */
export function rankLabel(rank: number): string {
  if (rank <= 1) return 'Starter'
  const mod100 = rank % 100
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : rank % 10 === 1
        ? 'st'
        : rank % 10 === 2
          ? 'nd'
          : rank % 10 === 3
            ? 'rd'
            : 'th'
  return `${rank}${suffix} string`
}

/** "LT, 2nd string" or "Kickoff K, Starter". */
export function spotLabel(spot: Pick<MyDepthSpot, 'slot' | 'rank'>): string {
  return `${slotDisplay(spot.slot)}, ${rankLabel(spot.rank)}`
}

/** Shared notes the player has not seen: shared (or re-shared after an edit) since `seenAt`. */
export function unseenNotes<T extends Pick<MyDepthNote, 'sharedAt' | 'createdAt'>>(
  notes: readonly T[],
  seenAt: string | null,
): T[] {
  if (seenAt == null) return [...notes]
  const seen = new Date(seenAt).getTime()
  if (Number.isNaN(seen)) return [...notes]
  return notes.filter((note) => new Date(note.sharedAt ?? note.createdAt).getTime() > seen)
}

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): KeyStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function seenKey(teamId: string, userId: string): string {
  return `pov.depthNotesSeen.${teamId}.${userId}`
}

/** When this player last looked at their depth notes, or null. Never throws. */
export function readNotesSeen(
  teamId: string,
  userId: string,
  store: KeyStore | null = defaultStore(),
): string | null {
  try {
    return store?.getItem(seenKey(teamId, userId)) ?? null
  } catch {
    return null
  }
}

/** Records that this player has seen their notes. Never throws. */
export function writeNotesSeen(
  teamId: string,
  userId: string,
  at: Date = new Date(),
  store: KeyStore | null = defaultStore(),
): void {
  try {
    store?.setItem(seenKey(teamId, userId), at.toISOString())
  } catch {
    // Private window or blocked storage: the marker just shows again next time.
  }
}
