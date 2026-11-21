import type { PositionCode, Side, StaffSide } from '../data/database.types'

/** The six special teams units. */
export type SpecialUnit = 'ko' | 'kr' | 'punt' | 'pr' | 'fg' | 'pat'
export type Unit = Side | SpecialUnit
/** Top-level tabs on the depth chart. */
export type UnitGroup = Side | 'special'

export const SPECIAL_UNITS: readonly SpecialUnit[] = ['ko', 'kr', 'punt', 'pr', 'fg', 'pat']

type SlotRow = [
  id: string,
  label: string,
  name: string,
  col: number,
  row: number,
  suggest: PositionCode[],
]

function unit(prefix: string, u: SpecialUnit, rows: SlotRow[]): DepthSlot[] {
  return rows.map(([id, label, name, col, row, suggest]) => ({
    id: `${prefix}_${id}`,
    label,
    name,
    unit: u,
    col,
    row,
    suggest,
  }))
}

const COVER: PositionCode[] = ['LB', 'S', 'CB', 'WR', 'RB']
const LINE: PositionCode[] = ['OL', 'DL', 'TE']

/** Field goal and PAT share one shape. */
function kickBlock(prefix: string, u: SpecialUnit): DepthSlot[] {
  return unit(prefix, u, [
    ['LE', 'TE', 'Left end', 2, 1, ['TE', 'DL', 'OL']],
    ['LT', 'LT', 'Left tackle', 3, 1, ['OL']],
    ['LG', 'LG', 'Left guard', 4, 1, ['OL']],
    ['LS', 'LS', 'Long snapper', 5, 1, ['OL', 'TE']],
    ['RG', 'RG', 'Right guard', 6, 1, ['OL']],
    ['RT', 'RT', 'Right tackle', 7, 1, ['OL']],
    ['RE', 'TE', 'Right end', 8, 1, ['TE', 'DL', 'OL']],
    ['LW', 'W', 'Left wing', 1, 2, ['TE', 'LB', 'DL']],
    ['RW', 'W', 'Right wing', 9, 2, ['TE', 'LB', 'DL']],
    ['H', 'H', 'Holder', 5, 2, ['QB', 'K', 'WR']],
    ['K', 'K', 'Kicker', 5, 3, ['K']],
  ])
}

/** Must match app.depth_slot_side in the database. */
const SPECIAL_SLOTS: DepthSlot[] = [
  // Kickoff: ten across, kicker behind. Coverage moves up the screen.
  ...unit('KO', 'ko', [
    ['L5', 'L5', 'Left 5', 1, 1, COVER],
    ['L4', 'L4', 'Left 4', 2, 1, COVER],
    ['L3', 'L3', 'Left 3', 3, 1, COVER],
    ['L2', 'L2', 'Left 2', 4, 1, COVER],
    ['L1', 'L1', 'Left 1', 5, 1, COVER],
    ['R1', 'R1', 'Right 1', 7, 1, COVER],
    ['R2', 'R2', 'Right 2', 8, 1, COVER],
    ['R3', 'R3', 'Right 3', 9, 1, COVER],
    ['R4', 'R4', 'Right 4', 10, 1, COVER],
    ['R5', 'R5', 'Right 5', 11, 1, COVER],
    ['K', 'K', 'Kicker', 6, 2, ['K']],
  ]),
  // Kick return: front line, second line, two deep returners.
  ...unit('KR', 'kr', [
    ['F1', 'F1', 'Front 1', 3, 1, LINE],
    ['F2', 'F2', 'Front 2', 4, 1, LINE],
    ['F3', 'F3', 'Front 3', 5, 1, LINE],
    ['F4', 'F4', 'Front 4', 6, 1, LINE],
    ['F5', 'F5', 'Front 5', 7, 1, LINE],
    ['S1', 'S1', 'Second line 1', 2, 2, ['TE', 'LB', 'RB', 'FB']],
    ['S2', 'S2', 'Second line 2', 4, 2, ['TE', 'LB', 'RB', 'FB']],
    ['S3', 'S3', 'Second line 3', 6, 2, ['TE', 'LB', 'RB', 'FB']],
    ['S4', 'S4', 'Second line 4', 8, 2, ['TE', 'LB', 'RB', 'FB']],
    ['R1', 'KR', 'Returner', 4, 3, ['RB', 'WR', 'CB', 'S']],
    ['R2', 'KR', 'Returner 2', 6, 3, ['RB', 'WR', 'CB', 'S']],
  ]),
  // Punt: line with gunners split wide, wings, personal protector, punter.
  ...unit('PNT', 'punt', [
    ['GL', 'G', 'Left gunner', 1, 1, ['WR', 'CB', 'S']],
    ['LT', 'LT', 'Left tackle', 3, 1, ['OL', 'TE', 'DL']],
    ['LG', 'LG', 'Left guard', 4, 1, ['OL', 'DL']],
    ['LS', 'LS', 'Long snapper', 5, 1, ['OL', 'TE']],
    ['RG', 'RG', 'Right guard', 6, 1, ['OL', 'DL']],
    ['RT', 'RT', 'Right tackle', 7, 1, ['OL', 'TE', 'DL']],
    ['GR', 'G', 'Right gunner', 9, 1, ['WR', 'CB', 'S']],
    ['LW', 'W', 'Left wing', 2, 2, ['TE', 'LB', 'FB']],
    ['RW', 'W', 'Right wing', 8, 2, ['TE', 'LB', 'FB']],
    ['PP', 'PP', 'Personal protector', 5, 2, ['LB', 'FB', 'S', 'RB']],
    ['P', 'P', 'Punter', 5, 3, ['K']],
  ]),
  // Punt return: vises on the gunners, front five, up back, returner.
  ...unit('PR', 'pr', [
    ['VL1', 'V', 'Left vise (outside)', 1, 1, ['CB', 'WR', 'S']],
    ['VL2', 'V', 'Left vise (inside)', 2, 1, ['CB', 'WR', 'S']],
    ['F1', 'F1', 'Front 1', 3, 1, ['DL', 'LB', 'TE']],
    ['F2', 'F2', 'Front 2', 4, 1, ['DL', 'LB', 'TE']],
    ['F3', 'F3', 'Front 3', 5, 1, ['DL', 'LB', 'TE']],
    ['F4', 'F4', 'Front 4', 6, 1, ['DL', 'LB', 'TE']],
    ['F5', 'F5', 'Front 5', 7, 1, ['DL', 'LB', 'TE']],
    ['VR2', 'V', 'Right vise (inside)', 8, 1, ['CB', 'WR', 'S']],
    ['VR1', 'V', 'Right vise (outside)', 9, 1, ['CB', 'WR', 'S']],
    ['U', 'U', 'Up back', 5, 2, ['S', 'LB', 'RB']],
    ['R', 'PR', 'Returner', 5, 3, ['WR', 'CB', 'RB', 'S']],
  ]),
  ...kickBlock('FG', 'fg'),
  ...kickBlock('PAT', 'pat'),
]

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
  ...SPECIAL_SLOTS,
]

export const UNIT_LABEL: Record<Unit, string> = {
  offense: 'Offense',
  defense: 'Defense',
  ko: 'Kickoff',
  kr: 'Kick return',
  punt: 'Punt',
  pr: 'Punt return',
  fg: 'Field goal',
  pat: 'PAT',
}

export const GROUP_LABEL: Record<UnitGroup, string> = {
  offense: 'Offense',
  defense: 'Defense',
  special: 'Special teams',
}

export function groupOf(u: Unit): UnitGroup {
  return u === 'offense' || u === 'defense' ? u : 'special'
}

/** Grid columns on wide screens. Kickoff lines up eleven across. */
export function unitColumns(u: Unit): number {
  return u === 'ko' ? 11 : 9
}

export function slotsFor(unit: Unit): DepthSlot[] {
  return DEPTH_SLOTS.filter((slot) => slot.unit === unit)
}

/** The side whose coordinator edits this slot. */
export function slotSide(slotId: string): StaffSide | null {
  const found = DEPTH_SLOTS.find((slot) => slot.id === slotId)
  return found == null ? null : groupOf(found.unit)
}

export const MAX_DEPTH = 6

/** Short name for hints: "RDT" on offense and defense, "Kickoff K" on special teams. */
export function slotDisplay(slotId: string): string {
  const found = DEPTH_SLOTS.find((slot) => slot.id === slotId)
  if (found == null) return slotId
  if (found.unit === 'offense' || found.unit === 'defense') return found.id
  return `${UNIT_LABEL[found.unit]} ${found.label}`
}
