import { FIELD_WIDTH } from '../play/coords'
import { LOS_Y, VIEW_YARDS } from './geometry'
import type { Diagram, DPlayer, TokenColor } from './types'

/**
 * Offense and defense formations a coach sets in one click and then drags around. Spots are
 * in yards from the ball: `dx` downfield from the line of scrimmage (negative is the backfield,
 * positive is defense), `dy` sideways (positive is the offense's left, the page's left).
 */
export type PresetSide = 'offense' | 'defense'

export interface Spot {
  slot: string
  dx: number
  dy: number
  /** Text on the token. Defaults to the slot in capitals; linemen get none. */
  label?: string
  color?: TokenColor
}

export interface Preset {
  key: string
  name: string
  side: PresetSide
  spots: readonly Spot[]
}

const OL: readonly Spot[] = [
  { slot: 'lt', dx: -0.5, dy: 4 },
  { slot: 'lg', dx: -0.5, dy: 2 },
  { slot: 'c', dx: -0.5, dy: 0 },
  { slot: 'rg', dx: -0.5, dy: -2 },
  { slot: 'rt', dx: -0.5, dy: -4 },
]

/** The same formation with left and right swapped. */
function mirror(spots: readonly Spot[]): Spot[] {
  return spots.map((spot) => ({ ...spot, dy: spot.dy === 0 ? 0 : -spot.dy }))
}

const TRIPS_RIGHT: readonly Spot[] = [
  ...OL,
  { slot: 'qb', dx: -5, dy: 0 },
  { slot: 'rb', dx: -6, dy: -1 },
  { slot: 'x', dx: -1, dy: 14 },
  { slot: 'z', dx: -1, dy: -16 },
  { slot: 'h', dx: -1, dy: -8 },
  { slot: 'y', dx: -0.5, dy: -6 },
]

export const OFFENSE_PRESETS: readonly Preset[] = [
  {
    key: 'i-form',
    name: 'I-Formation',
    side: 'offense',
    spots: [
      ...OL,
      { slot: 'qb', dx: -1, dy: 0 },
      { slot: 'fb', dx: -4, dy: 0, label: 'F', color: 'green' },
      { slot: 'rb', dx: -7, dy: 0 },
      { slot: 'x', dx: -0.5, dy: 14 },
      { slot: 'z', dx: -0.5, dy: -14 },
      { slot: 'y', dx: -0.5, dy: -6 },
    ],
  },
  {
    key: 'pro-rt',
    name: 'Pro Right Slot',
    side: 'offense',
    spots: [
      ...OL,
      { slot: 'qb', dx: -1, dy: 0 },
      { slot: 'rb', dx: -7, dy: 0 },
      { slot: 'x', dx: -0.5, dy: 12 },
      { slot: 'y', dx: -0.5, dy: -6 },
      { slot: 'h', dx: -1, dy: -9 },
      { slot: 'z', dx: -1, dy: -14 },
    ],
  },
  {
    key: 'ace',
    name: 'Ace (2 TE)',
    side: 'offense',
    spots: [
      ...OL,
      { slot: 'qb', dx: -1, dy: 0 },
      { slot: 'rb', dx: -5, dy: 0 },
      { slot: 'x', dx: -0.5, dy: 14 },
      { slot: 'z', dx: -0.5, dy: -14 },
      { slot: 'y', dx: -0.5, dy: -6 },
      { slot: 't', dx: -0.5, dy: 6, label: 'T', color: 'orange' },
    ],
  },
  {
    key: 'gun-spread',
    name: 'Gun Spread',
    side: 'offense',
    spots: [
      ...OL,
      { slot: 'qb', dx: -5, dy: 0 },
      { slot: 'rb', dx: -5, dy: 2 },
      { slot: 'x', dx: -0.5, dy: 16 },
      { slot: 'h', dx: -1, dy: 9 },
      { slot: 'y', dx: -1, dy: -9 },
      { slot: 'z', dx: -0.5, dy: -16 },
    ],
  },
  { key: 'trips-rt', name: 'Gun Trips Right', side: 'offense', spots: TRIPS_RIGHT },
  { key: 'trips-lt', name: 'Gun Trips Left', side: 'offense', spots: mirror(TRIPS_RIGHT) },
  {
    key: 'empty',
    name: 'Gun Empty 3x2',
    side: 'offense',
    spots: [
      ...OL,
      { slot: 'qb', dx: -5, dy: 0 },
      { slot: 'x', dx: -0.5, dy: 17 },
      { slot: 's', dx: -1, dy: 10, label: 'S', color: 'orange' },
      { slot: 'z', dx: -0.5, dy: -17 },
      { slot: 'h', dx: -1, dy: -11 },
      { slot: 'y', dx: -1, dy: -5.5 },
    ],
  },
  {
    key: 'bunch-rt',
    name: 'Gun Bunch Right',
    side: 'offense',
    spots: [
      ...OL,
      { slot: 'qb', dx: -5, dy: 0 },
      { slot: 'rb', dx: -5, dy: 2 },
      { slot: 'x', dx: -0.5, dy: 15 },
      { slot: 'y', dx: -0.5, dy: -7 },
      { slot: 'h', dx: -1.6, dy: -8.5 },
      { slot: 'z', dx: -1, dy: -10 },
    ],
  },
]

/** Defenders line up 1.6 yards off the ball so they don't sit on the offensive line. */
const DL4: readonly Spot[] = [
  { slot: 'de1', dx: 1.6, dy: 6.5, label: 'DE' },
  { slot: 'dt1', dx: 1.6, dy: 2.5, label: 'DT' },
  { slot: 'dt2', dx: 1.6, dy: -2.5, label: 'DT' },
  { slot: 'de2', dx: 1.6, dy: -6.5, label: 'DE' },
]

const CORNERS = (depth: number, wide: number): Spot[] => [
  { slot: 'cb1', dx: depth, dy: wide, label: 'CB' },
  { slot: 'cb2', dx: depth, dy: -wide, label: 'CB' },
]

export const DEFENSE_PRESETS: readonly Preset[] = [
  {
    key: 'd-43',
    name: '4-3 Over',
    side: 'defense',
    spots: [
      ...DL4,
      { slot: 'w', dx: 4.5, dy: 7, label: 'W' },
      { slot: 'm', dx: 4.5, dy: 0, label: 'M' },
      { slot: 's', dx: 4.5, dy: -7, label: 'S' },
      ...CORNERS(7, 16),
      { slot: 'fs', dx: 12, dy: 4, label: 'FS' },
      { slot: 'ss', dx: 10, dy: -5, label: 'SS' },
    ],
  },
  {
    key: 'd-425',
    name: '4-2-5 Nickel',
    side: 'defense',
    spots: [
      ...DL4,
      { slot: 'w', dx: 4.5, dy: 3, label: 'W' },
      { slot: 'm', dx: 4.5, dy: -3, label: 'M' },
      { slot: 'n', dx: 4.5, dy: -10, label: 'N' },
      ...CORNERS(7, 16),
      { slot: 'fs', dx: 12, dy: 4, label: 'FS' },
      { slot: 'ss', dx: 12, dy: -4, label: 'SS' },
    ],
  },
  {
    key: 'd-34',
    name: '3-4',
    side: 'defense',
    spots: [
      { slot: 'de1', dx: 1.6, dy: 5, label: 'DE' },
      { slot: 'nt', dx: 1.6, dy: 0, label: 'NT' },
      { slot: 'de2', dx: 1.6, dy: -5, label: 'DE' },
      { slot: 'w', dx: 4, dy: 10, label: 'W' },
      { slot: 'i1', dx: 4.5, dy: 3, label: 'I' },
      { slot: 'i2', dx: 4.5, dy: -3, label: 'I' },
      { slot: 's', dx: 4, dy: -10, label: 'S' },
      ...CORNERS(7, 16),
      { slot: 'fs', dx: 12, dy: 4, label: 'FS' },
      { slot: 'ss', dx: 10, dy: -5, label: 'SS' },
    ],
  },
  {
    key: 'd-44',
    name: '4-4 Split',
    side: 'defense',
    spots: [
      ...DL4,
      { slot: 'w', dx: 4.5, dy: 9, label: 'W' },
      { slot: 'm1', dx: 4.5, dy: 3, label: 'M' },
      { slot: 'm2', dx: 4.5, dy: -3, label: 'M' },
      { slot: 's', dx: 4.5, dy: -9, label: 'S' },
      ...CORNERS(7, 16),
      { slot: 'fs', dx: 12, dy: 0, label: 'FS' },
    ],
  },
  {
    key: 'd-cover2',
    name: 'Cover 2 Shell',
    side: 'defense',
    spots: [
      ...DL4,
      { slot: 'w', dx: 4.5, dy: 7, label: 'W' },
      { slot: 'm', dx: 4.5, dy: 0, label: 'M' },
      { slot: 's', dx: 4.5, dy: -7, label: 'S' },
      ...CORNERS(5, 17),
      { slot: 'fs', dx: 13, dy: 9, label: 'FS' },
      { slot: 'ss', dx: 13, dy: -9, label: 'SS' },
    ],
  },
  {
    key: 'd-cover3',
    name: 'Cover 3 Shell',
    side: 'defense',
    spots: [
      ...DL4,
      { slot: 'w', dx: 4.5, dy: 7, label: 'W' },
      { slot: 'm', dx: 4.5, dy: 0, label: 'M' },
      { slot: 's', dx: 4.5, dy: -7, label: 'S' },
      ...CORNERS(8, 17),
      { slot: 'fs', dx: 13, dy: 0, label: 'FS' },
      { slot: 'ss', dx: 7, dy: -11, label: 'SS' },
    ],
  },
]

/** Just the five linemen. Not listed in the picker; the search box's "Blank line". */
export const BLANK_LINE: Preset = { key: 'blank', name: 'Blank line', side: 'offense', spots: OL }

export const PRESETS: readonly Preset[] = [...OFFENSE_PRESETS, ...DEFENSE_PRESETS]

export function findPreset(key: string | null | undefined): Preset | undefined {
  return key == null ? undefined : PRESETS.find((preset) => preset.key === key)
}

const OFFENSE_COLOR: Record<string, TokenColor> = {
  x: 'red',
  z: 'blue',
  y: 'orange',
  h: 'purple',
  rb: 'green',
  qb: 'black',
}
const LINEMEN = new Set(['lt', 'lg', 'c', 'rg', 'rt'])

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** A preset's players on the field, with ids starting after `from`. */
export function presetPlayers(preset: Preset, from = 0): DPlayer[] {
  return preset.spots.map((spot, i) => {
    const defense = preset.side === 'defense'
    const lineman = !defense && LINEMEN.has(spot.slot)
    const label = spot.label ?? (lineman ? undefined : spot.slot.toUpperCase())
    return {
      id: `p${from + i + 1}`,
      shape: 'circle',
      // Defenders are dark tokens, so the two sides read apart at a glance.
      color: defense
        ? 'black'
        : lineman
          ? 'white'
          : (spot.color ?? OFFENSE_COLOR[spot.slot] ?? 'white'),
      fillStyle: 'solid',
      side: preset.side,
      // Offense moves up the page; +dy is its left, which is the page's left.
      x: clamp01(0.5 - spot.dy / FIELD_WIDTH),
      y: clamp01(LOS_Y - spot.dx / VIEW_YARDS),
      ...(label != null ? { label } : {}),
      ...(!defense && spot.slot === 'c' ? { square: true } : {}),
    }
  })
}

function highestId(d: Diagram): number {
  let n = 0
  for (const item of [...d.players, ...d.lines, ...d.notes]) {
    n = Math.max(n, Number.parseInt(item.id.slice(1), 10) || 0)
  }
  return n
}

/**
 * Set one side's formation on a diagram. Putting in an offense replaces the offense (and
 * anything not tagged defense, except text) and keeps the defense. Putting in a defense
 * replaces only the defense. Notes and text stay. Lines of removed players go with them.
 */
export function applyPreset(d: Diagram, preset: Preset): Diagram {
  const keep = (p: DPlayer) =>
    preset.side === 'offense' ? p.side === 'defense' || p.shape === 'text' : p.side !== 'defense'
  const kept = d.players.filter(keep)
  const keptIds = new Set(kept.map((p) => p.id))
  const base: Diagram = {
    ...d,
    players: kept,
    lines: d.lines.filter((l) => keptIds.has(l.playerId)),
  }
  const added = presetPlayers(preset, highestId(base))
  return {
    ...base,
    formation: preset.side === 'offense' ? preset.name : d.formation,
    players: [...kept, ...added],
  }
}

/** Remove one side's players and their lines. Offense is everything not tagged defense, bar text. */
export function clearSide(d: Diagram, side: PresetSide): Diagram {
  const gone = new Set(
    d.players
      .filter((p) =>
        side === 'defense' ? p.side === 'defense' : p.side !== 'defense' && p.shape !== 'text',
      )
      .map((p) => p.id),
  )
  if (gone.size === 0) return d
  return {
    ...d,
    players: d.players.filter((p) => !gone.has(p.id)),
    lines: d.lines.filter((l) => !gone.has(l.playerId)),
  }
}

/** A preset on its own, for its preview card. */
export function presetDiagram(preset: Preset): Diagram {
  return { formation: preset.name, players: presetPlayers(preset), lines: [], notes: [] }
}
