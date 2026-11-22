import type { PlaySide } from './sourceTypes'

/**
 * Which scout look a saved play is watched against. The look is fixed per open: the
 * play sheet (or the viewer's own switcher) navigates to `/watch/<play>?look=<look>`, and
 * no param means the look the play was charted against (`plays.default_look_id`).
 * Homework links (#44) use exactly this URL shape.
 */

/** Saved looks are uuids, like saved plays. */
const LOOK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isLookId(value: string | null | undefined): value is string {
  return value != null && LOOK_ID.test(value)
}

/** The raw `?look=` value, or null when the param is missing or empty. */
export function lookParam(search: string): string | null {
  const value = new URLSearchParams(search).get('look')
  return value == null || value.trim() === '' ? null : value.trim()
}

export type LookPick =
  /** Compile against the charted look: the stored compiled play is already that pair. */
  | { kind: 'charted'; id: string | null }
  /** Compile the play's source against another saved look. */
  | { kind: 'chosen'; id: string }
  /** The param is not a look id at all. Never fall back to the charted look silently. */
  | { kind: 'invalid'; value: string }

export function pickLook(param: string | null, defaultLookId: string | null): LookPick {
  if (param == null) return { kind: 'charted', id: defaultLookId }
  if (!isLookId(param)) return { kind: 'invalid', value: param }
  if (defaultLookId != null && param.toLowerCase() === defaultLookId.toLowerCase()) {
    return { kind: 'charted', id: defaultLookId }
  }
  return { kind: 'chosen', id: param }
}

/** The viewer URL for a saved play against a look. The charted look keeps the bare URL. */
export function watchUrl(
  playId: string,
  lookId?: string | null,
  defaultLookId?: string | null,
): string {
  const base = `/watch/${playId}`
  if (lookId == null || lookId === '' || lookId === defaultLookId) return base
  return `${base}?look=${encodeURIComponent(lookId)}`
}

/** A look offered in the pickers. */
export interface LookOption {
  id: string
  name: string
  side: PlaySide
  /** The look the play was charted against. */
  charted: boolean
  /** Names of the scout packages this look is filed in (assigned ones, for a player). */
  packages: string[]
}

export interface LookGroup {
  label: string
  options: LookOption[]
}

/** The other side: an offense play is watched against defense looks, and the reverse. */
export function lookSideFor(playSide: PlaySide): PlaySide {
  return playSide === 'offense' ? 'defense' : 'offense'
}

/**
 * The picker's groups: the charted look first, then each package's looks, then the rest
 * of the team's scout looks. Only looks of the opposite side are playable, and every one
 * of them is (no per-play marking). A look in two packages shows under the first.
 */
export function groupLookOptions(playSide: PlaySide, looks: readonly LookOption[]): LookGroup[] {
  const side = lookSideFor(playSide)
  const playable = looks.filter((look) => look.side === side)
  const seen = new Set<string>()
  const groups: LookGroup[] = []
  const charted = playable.filter((look) => look.charted)
  if (charted.length > 0) {
    groups.push({ label: 'Charted with this play', options: charted })
    charted.forEach((look) => seen.add(look.id))
  }
  const packageNames = [...new Set(playable.flatMap((look) => look.packages))].sort((a, b) =>
    a.localeCompare(b),
  )
  for (const name of packageNames) {
    const options = playable.filter((look) => !seen.has(look.id) && look.packages.includes(name))
    if (options.length === 0) continue
    options.forEach((look) => seen.add(look.id))
    groups.push({ label: `Package: ${name}`, options })
  }
  const rest = playable
    .filter((look) => !seen.has(look.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (rest.length > 0) groups.push({ label: 'Team scout looks', options: rest })
  return groups
}
