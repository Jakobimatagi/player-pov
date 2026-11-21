import type { PositionCode, Side } from '../data/database.types'

export type Unit = Side | 'special'

/** One depth chart position. `col`/`row` place the card on the field (wide screens). */
export interface DepthSlot {
  id: string
  label: string
  name: string
  unit: Unit
  col: number
  row: number
  /** Roster positions offered first when filling this slot. */
  suggest: readonly PositionCode[]
}

/** Must match the slot list in the depth_chart check and app.depth_slot_side. */
export const DEPTH_SLOTS: readonly DepthSlot[] = [
  // Offense, line of scrimmage on row 1, offense moving up the screen.
  { id: 'X', label: 'X', name: 'Split end', unit: 'offense', col: 1, row: 1, suggest: ['WR'] },
  { id: 'LT', label: 'LT', name: 'Left tackle', unit: 'offense', col: 3, row: 1, suggest: ['OL'] },
  { id: 'LG', label: 'LG', name: 'Left guard', unit: 'offense', col: 4, row: 1, suggest: ['OL'] },
  { id: 'C', label: 'C', name: 'Center', unit: 'offense', col: 5, row: 1, suggest: ['OL'] },
  { id: 'RG', label: 'RG', name: 'Right guard', unit: 'offense', col: 6, row: 1, suggest: ['OL'] },
  { id: 'RT', label: 'RT', name: 'Right tackle', unit: 'offense', col: 7, row: 1, suggest: ['OL'] },
  { id: 'Y', label: 'TE', name: 'Tight end', unit: 'offense', col: 8, row: 1, suggest: ['TE'] },
  { id: 'Z', label: 'Z', name: 'Flanker', unit: 'offense', col: 9, row: 2, suggest: ['WR'] },
  { id: 'SL', label: 'SL', name: 'Slot', unit: 'offense', col: 2, row: 2, suggest: ['WR', 'RB'] },
  { id: 'QB', label: 'QB', name: 'Quarterback', unit: 'offense', col: 5, row: 2, suggest: ['QB'] },
  {
    id: 'RB',
    label: 'RB',
    name: 'Running back',
    unit: 'offense',
    col: 5,
    row: 3,
    suggest: ['RB', 'FB'],
  },
  // Defense (4-3), deep players on row 1, line of scrimmage on row 3.
  { id: 'SS', label: 'SS', name: 'Strong safety', unit: 'defense', col: 7, row: 1, suggest: ['S'] },
  { id: 'FS', label: 'FS', name: 'Free safety', unit: 'defense', col: 3, row: 1, suggest: ['S'] },
  {
    id: 'WILL',
    label: 'W',
    name: 'Will linebacker',
    unit: 'defense',
    col: 3,
    row: 2,
    suggest: ['LB'],
  },
  {
    id: 'MIKE',
    label: 'M',
    name: 'Mike linebacker',
    unit: 'defense',
    col: 5,
    row: 2,
    suggest: ['LB'],
  },
  {
    id: 'SAM',
    label: 'S',
    name: 'Sam linebacker',
    unit: 'defense',
    col: 7,
    row: 2,
    suggest: ['LB'],
  },
  { id: 'LCB', label: 'CB', name: 'Left corner', unit: 'defense', col: 1, row: 3, suggest: ['CB'] },
  { id: 'LDE', label: 'DE', name: 'Left end', unit: 'defense', col: 3, row: 3, suggest: ['DL'] },
  { id: 'LDT', label: 'DT', name: 'Left tackle', unit: 'defense', col: 4, row: 3, suggest: ['DL'] },
  {
    id: 'RDT',
    label: 'DT',
    name: 'Right tackle',
    unit: 'defense',
    col: 6,
    row: 3,
    suggest: ['DL'],
  },
  { id: 'RDE', label: 'DE', name: 'Right end', unit: 'defense', col: 7, row: 3, suggest: ['DL'] },
  {
    id: 'RCB',
    label: 'CB',
    name: 'Right corner',
    unit: 'defense',
    col: 9,
    row: 3,
    suggest: ['CB'],
  },
  // Special teams.
  { id: 'K', label: 'K', name: 'Kicker', unit: 'special', col: 1, row: 1, suggest: ['K'] },
  { id: 'P', label: 'P', name: 'Punter', unit: 'special', col: 2, row: 1, suggest: ['K'] },
  {
    id: 'LS',
    label: 'LS',
    name: 'Long snapper',
    unit: 'special',
    col: 3,
    row: 1,
    suggest: ['OL', 'TE'],
  },
  { id: 'HLD', label: 'H', name: 'Holder', unit: 'special', col: 1, row: 2, suggest: ['QB', 'K'] },
  {
    id: 'KR',
    label: 'KR',
    name: 'Kick returner',
    unit: 'special',
    col: 2,
    row: 2,
    suggest: ['RB', 'WR', 'CB'],
  },
  {
    id: 'PR',
    label: 'PR',
    name: 'Punt returner',
    unit: 'special',
    col: 3,
    row: 2,
    suggest: ['WR', 'CB', 'S'],
  },
]

export const UNIT_LABEL: Record<Unit, string> = {
  offense: 'Offense',
  defense: 'Defense',
  special: 'Special teams',
}

export function slotsFor(unit: Unit): DepthSlot[] {
  return DEPTH_SLOTS.filter((slot) => slot.unit === unit)
}

/** The side whose coordinator edits this slot. Special teams are shared (null). */
export function slotSide(slotId: string): Side | null {
  const unit = DEPTH_SLOTS.find((slot) => slot.id === slotId)?.unit
  return unit === 'offense' || unit === 'defense' ? unit : null
}

export const MAX_DEPTH = 6
