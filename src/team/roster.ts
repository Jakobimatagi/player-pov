import type { PositionCode, Side } from '../data/database.types'
import type { DepthSlot } from './depthSlots'

/** One row of the coach's roster. `userId` is set when the player has an app account. */
export interface RosterPlayer {
  id: string
  userId: string | null
  name: string
  jersey: number | null
  position: PositionCode | null
  altPositions: PositionCode[]
  gradYear: number | null
  heightIn: number | null
  weightLb: number | null
  notes: string
}

/** Ordered roster player ids per depth slot, starter first. */
export type DepthMap = Record<string, string[]>

export const POSITION_CODES: readonly PositionCode[] = [
  'QB',
  'RB',
  'FB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'CB',
  'S',
  'K',
  'ATH',
]

const OFFENSE = new Set<PositionCode>(['QB', 'RB', 'FB', 'WR', 'TE', 'OL'])
const DEFENSE = new Set<PositionCode>(['DL', 'LB', 'CB', 'S'])

export type RosterFilter = 'all' | Side | 'special' | 'unassigned'

export function positionSide(position: PositionCode | null): Side | 'special' | null {
  if (position == null || position === 'ATH') return null
  if (OFFENSE.has(position)) return 'offense'
  if (DEFENSE.has(position)) return 'defense'
  return 'special'
}

export function matchesFilter(player: RosterPlayer, filter: RosterFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'unassigned') return player.position == null
  const codes = [player.position, ...player.altPositions]
  return codes.some((code) => code === 'ATH' || positionSide(code) === filter)
}

/** "5'11\"" for 71. Empty for null. */
export function formatHeight(inches: number | null): string {
  if (inches == null) return ''
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

/**
 * Reads 5'11", 5-11, 5 11, 511 or plain inches (71). Blank is null.
 * Returns 'invalid' when it can't be read or falls outside 4'0"–8'0".
 */
export function parseHeight(raw: string): number | null | 'invalid' {
  const text = raw.trim()
  if (text === '') return null
  let inches: number
  const split = /^(\d)\s*(?:'|ft|-|\s)\s*(\d{1,2})\s*(?:"|in|'')?$/i.exec(text)
  if (split != null) {
    inches = Number(split[1]) * 12 + Number(split[2])
    if (Number(split[2]) > 11) return 'invalid'
  } else if (/^\d'$/.test(text)) {
    inches = Number(text[0]) * 12
  } else if (/^[4-7](?:0\d|1[01])$/.test(text)) {
    inches = Number(text[0]) * 12 + Number(text.slice(1))
  } else if (/^\d{2}$/.test(text)) {
    inches = Number(text)
  } else {
    return 'invalid'
  }
  return inches >= 48 && inches <= 96 ? inches : 'invalid'
}

/** Whole number in [min, max], null for blank, 'invalid' otherwise. */
export function parseWhole(raw: string, min: number, max: number): number | null | 'invalid' {
  const text = raw.trim().replace(/^#/, '')
  if (text === '') return null
  if (!/^\d+$/.test(text)) return 'invalid'
  const value = Number(text)
  return value >= min && value <= max ? value : 'invalid'
}

/** "LB, s / ath" → ['LB', 'S', 'ATH']. Unknown codes are dropped. */
export function parsePositions(raw: string): PositionCode[] {
  const out: PositionCode[] = []
  for (const part of raw.toUpperCase().split(/[\s,/]+/)) {
    const code = (part === 'DB' ? 'CB' : part === 'SAF' ? 'S' : part) as PositionCode
    if (POSITION_CODES.includes(code) && !out.includes(code)) out.push(code)
  }
  return out
}

export type RosterSort = 'jersey' | 'name' | 'position' | 'gradYear'

export function sortRoster(players: readonly RosterPlayer[], by: RosterSort): RosterPlayer[] {
  const order = (code: PositionCode | null) => (code == null ? 99 : POSITION_CODES.indexOf(code))
  const byName = (a: RosterPlayer, b: RosterPlayer) => a.name.localeCompare(b.name)
  return [...players].sort((a, b) => {
    if (by === 'name') return byName(a, b)
    if (by === 'position') return order(a.position) - order(b.position) || byName(a, b)
    if (by === 'gradYear') return (a.gradYear ?? 9999) - (b.gradYear ?? 9999) || byName(a, b)
    return (a.jersey ?? 999) - (b.jersey ?? 999) || byName(a, b)
  })
}

export function playerLabel(player: Pick<RosterPlayer, 'name' | 'jersey'>): string {
  return player.jersey == null ? player.name : `#${player.jersey} ${player.name}`
}

/** Players for a slot's picker: suggested positions first, then everyone else. */
export function depthCandidates(
  slot: Pick<DepthSlot, 'suggest'>,
  players: readonly RosterPlayer[],
  exclude: readonly string[],
): { suggested: RosterPlayer[]; others: RosterPlayer[] } {
  const open = sortRoster(
    players.filter((player) => !exclude.includes(player.id)),
    'jersey',
  )
  const fits = (player: RosterPlayer) =>
    [player.position, ...player.altPositions].some(
      (code) => code != null && (code === 'ATH' || slot.suggest.includes(code)),
    )
  return { suggested: open.filter(fits), others: open.filter((player) => !fits(player)) }
}

/** Move one entry up (-1) or down (+1). Out of range is a no-op copy. */
export function moveInList<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item as T)
  return next
}

/** Slots each player holds, for "also at" hints. */
export function slotsByPlayer(
  depth: DepthMap,
  name: (slot: string) => string = (slot) => slot,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [slot, ids] of Object.entries(depth)) {
    ids.forEach((id, index) => {
      const list = out.get(id) ?? []
      list.push(index === 0 ? name(slot) : `${name(slot)} (${index + 1})`)
      out.set(id, list)
    })
  }
  return out
}

export interface PastedPlayer {
  name: string
  jersey: number | null
  position: PositionCode | null
  altPositions: PositionCode[]
  gradYear: number | null
  heightIn: number | null
  weightLb: number | null
}

/** Split one CSV/TSV line, honouring double quotes ("Smith, Jr." stays one cell). */
export function splitDelimited(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

type Column =
  'first' | 'last' | 'name' | 'jersey' | 'position' | 'alt' | 'grad' | 'height' | 'weight'

const HEADER_ALIASES: Record<Column, readonly string[]> = {
  first: ['first', 'first name', 'firstname', 'fname', 'given name'],
  last: ['last', 'last name', 'lastname', 'lname', 'surname', 'family name'],
  name: ['name', 'player', 'player name', 'full name', 'athlete', 'athlete name'],
  jersey: [
    '#',
    'no',
    'num',
    'number',
    'jersey',
    'jersey number',
    'jersey #',
    'jersey no',
    'uniform',
    'uniform number',
  ],
  position: ['pos', 'position', 'positions', 'primary position', 'pos 1', 'position 1'],
  alt: [
    'secondary position',
    'secondary positions',
    'other positions',
    'pos 2',
    'position 2',
    'alt positions',
    'alt position',
  ],
  grad: [
    'grad year',
    'graduation year',
    'grad',
    'class of',
    'class',
    'grade',
    'year',
    'yr',
    'grad yr',
  ],
  height: ['ht', 'height'],
  weight: ['wt', 'weight', 'weight lbs', 'weight (lbs)'],
}

function headerColumn(raw: string): Column | null {
  const key = raw
    .toLowerCase()
    .replace(/[^a-z0-9#() ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  for (const [column, aliases] of Object.entries(HEADER_ALIASES) as [Column, readonly string[]][]) {
    if (aliases.includes(key)) return column
  }
  return null
}

/** Senior class graduates the spring after this season. Seasons turn over in July. */
export function seniorGradYear(today: Date): number {
  return today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear()
}

/** "2027", "'27", "Sr", "Junior", "11" (grade) → graduation year. */
export function parseGradYear(raw: string, today: Date): number | null | 'invalid' {
  const text = raw.trim().toLowerCase().replace(/\.$/, '')
  if (text === '') return null
  const senior = seniorGradYear(today)
  const classes: Record<string, number> = {
    sr: 0,
    senior: 0,
    '12': 0,
    '12th': 0,
    jr: 1,
    junior: 1,
    '11': 1,
    '11th': 1,
    so: 2,
    soph: 2,
    sophomore: 2,
    '10': 2,
    '10th': 2,
    fr: 3,
    fresh: 3,
    freshman: 3,
    '9': 3,
    '9th': 3,
    '8': 4,
    '8th': 4,
  }
  if (text in classes) return senior + (classes[text] ?? 0)
  const short = /^'(\d{2})$/.exec(text)
  if (short != null) return 2000 + Number(short[1])
  return parseWhole(text, 2000, 2100)
}

export interface PastedPlayer {
  name: string
  jersey: number | null
  position: PositionCode | null
  altPositions: PositionCode[]
  gradYear: number | null
  heightIn: number | null
  weightLb: number | null
}

/**
 * Rows from a spreadsheet or a roster file. With a header row, columns are matched by
 * name (Name or First/Last, Number, Position, Class or Grad year, Height, Weight; other
 * columns are ignored). Without one, columns are read in this order: number, name,
 * position(s), grad year, height, weight. Only the name is required. Bad cells are
 * dropped and reported, not fatal.
 */
export function parseRosterTable(
  text: string,
  today: Date = new Date(),
): { players: PastedPlayer[]; problems: string[]; columns: string[] } {
  const players: PastedPlayer[] = []
  const problems: string[] = []
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  if (lines.length === 0) return { players, problems, columns: [] }
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : ','
  const rows = lines.map((line) => splitDelimited(line, delimiter))
  const header = (rows[0] ?? []).map(headerColumn)
  const named = header.filter((column) => column != null)
  const hasHeader =
    named.length >= 2 &&
    (named.includes('name') || named.includes('first') || named.includes('last'))
  const index = (column: Column) => header.indexOf(column)
  const at = (cells: string[], column: Column, fallback: number) => {
    const i = hasHeader ? index(column) : fallback
    return i < 0 ? '' : (cells[i] ?? '')
  }
  const body = hasHeader ? rows.slice(1) : rows
  body.forEach((cells, i) => {
    const row = i + 1 + (hasHeader ? 1 : 0)
    if (!hasHeader && i === 0 && cells.some((cell) => /^name$/i.test(cell))) return
    const full = at(cells, 'name', 1)
    const name = (full !== '' ? full : `${at(cells, 'first', -1)} ${at(cells, 'last', -1)}`)
      .replace(/\s+/g, ' ')
      .trim()
    if (name === '') {
      problems.push(`Row ${row}: no name, skipped`)
      return
    }
    const jerseyRaw = at(cells, 'jersey', 0)
    const yearRaw = at(cells, 'grad', 3)
    const heightRaw = at(cells, 'height', 4)
    const weightRaw = at(cells, 'weight', 5)
    const jersey = parseWhole(jerseyRaw, 0, 99)
    const gradYear = parseGradYear(yearRaw, today)
    const heightIn = parseHeight(heightRaw)
    const weightLb = parseWhole(weightRaw.replace(/\s*(lbs?|#)$/i, ''), 60, 450)
    if (jersey === 'invalid') problems.push(`Row ${row}: jersey "${jerseyRaw}" ignored`)
    if (gradYear === 'invalid') problems.push(`Row ${row}: year "${yearRaw}" ignored`)
    if (heightIn === 'invalid') problems.push(`Row ${row}: height "${heightRaw}" ignored`)
    if (weightLb === 'invalid') problems.push(`Row ${row}: weight "${weightRaw}" ignored`)
    const positions = parsePositions(
      `${at(cells, 'position', 2)} ${hasHeader ? at(cells, 'alt', -1) : ''}`,
    )
    players.push({
      name: name.slice(0, 80),
      jersey: jersey === 'invalid' ? null : jersey,
      position: positions[0] ?? null,
      altPositions: positions.slice(1),
      gradYear: gradYear === 'invalid' ? null : gradYear,
      heightIn: heightIn === 'invalid' ? null : heightIn,
      weightLb: weightLb === 'invalid' ? null : weightLb,
    })
  })
  const columns = hasHeader
    ? [...new Set(named)].map((column) =>
        column === 'first' || column === 'last' ? 'name' : column,
      )
    : []
  return { players, problems, columns: [...new Set(columns)] }
}

/** Positional paste (no header row). Kept for the paste box and its tests. */
export function parseRosterPaste(text: string): { players: PastedPlayer[]; problems: string[] } {
  const { players, problems } = parseRosterTable(text)
  return { players, problems }
}

/** Split an import into new players and ones already on the roster (same name). */
export function splitNewPlayers<T extends { name: string }>(
  incoming: readonly T[],
  roster: readonly { name: string }[],
): { fresh: T[]; existing: T[] } {
  const key = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')
  const known = new Set(roster.map((player) => key(player.name)))
  const fresh: T[] = []
  const existing: T[] = []
  for (const player of incoming) {
    if (known.has(key(player.name))) existing.push(player)
    else {
      fresh.push(player)
      known.add(key(player.name))
    }
  }
  return { fresh, existing }
}
