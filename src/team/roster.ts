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
export function slotsByPlayer(depth: DepthMap): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [slot, ids] of Object.entries(depth)) {
    ids.forEach((id, index) => {
      const list = out.get(id) ?? []
      list.push(index === 0 ? slot : `${slot} (${index + 1})`)
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

/**
 * Rows pasted from a spreadsheet: tab- or comma-separated, columns in this order:
 * jersey, name, position(s), grad year, height, weight. Only name is required. A header
 * row (one containing "name") is skipped. Bad cells are dropped and reported, not fatal.
 */
export function parseRosterPaste(text: string): { players: PastedPlayer[]; problems: string[] } {
  const players: PastedPlayer[] = []
  const problems: string[] = []
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  lines.forEach((line, index) => {
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim())
    if (index === 0 && cells.some((cell) => /^name$/i.test(cell))) return
    const [jerseyRaw = '', name = '', posRaw = '', yearRaw = '', heightRaw = '', weightRaw = ''] =
      cells
    const row = index + 1
    if (name === '') {
      problems.push(`Row ${row}: no name, skipped`)
      return
    }
    const jersey = parseWhole(jerseyRaw, 0, 99)
    const gradYear = parseWhole(yearRaw, 2000, 2100)
    const heightIn = parseHeight(heightRaw)
    const weightLb = parseWhole(weightRaw.replace(/\s*(lbs?|#)$/i, ''), 60, 450)
    if (jersey === 'invalid') problems.push(`Row ${row}: jersey "${jerseyRaw}" ignored`)
    if (gradYear === 'invalid') problems.push(`Row ${row}: year "${yearRaw}" ignored`)
    if (heightIn === 'invalid') problems.push(`Row ${row}: height "${heightRaw}" ignored`)
    if (weightLb === 'invalid') problems.push(`Row ${row}: weight "${weightRaw}" ignored`)
    const positions = parsePositions(posRaw)
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
  return { players, problems }
}
