/**
 * A play as a diagram: tokens, lines and notes on a field. Coordinates are 0..1 across the
 * field bounds (x left to right, y top to bottom), never pixels, so a diagram scales to any
 * size and prints the same. It is its own document, separate from the compiled PlaySource.
 */
export type Shape = 'circle' | 'triangle' | 'text'
export type TokenColor = 'white' | 'black' | 'red' | 'blue' | 'green' | 'orange' | 'purple'
export type FillStyle = 'solid' | 'split'

/** The closed set of line endings. Nothing else can be drawn. */
export type LineType =
  'route' | 'block' | 'path' | 'motion' | 'dashedRoute' | 'segmentedBlock' | 'checkRelease'

export interface Pt {
  x: number
  y: number
}

export interface DPlayer {
  id: string
  shape: Shape
  color: TokenColor
  fillStyle: FillStyle
  x: number
  y: number
  /** Text on a circle or triangle, or the whole content of a text token. */
  label?: string
  /** Drawn square instead of round: the center on a blank line. Circles only. */
  square?: boolean
  /** Which side a formation preset put this token on. Tokens a coach places have none. */
  side?: 'offense' | 'defense'
}

export interface DLine {
  id: string
  playerId: string
  type: LineType
  /** Where the line goes after the player, in order. The player's own spot is the start. */
  points: Pt[]
  /** Always the player's colour, kept in step when it changes. */
  color: TokenColor
}

export interface DNote {
  id: string
  x: number
  y: number
  text: string
}

export interface Diagram {
  formation: string
  players: DPlayer[]
  lines: DLine[]
  notes: DNote[]
}

export const TOKEN_COLORS: readonly TokenColor[] = [
  'white',
  'black',
  'red',
  'blue',
  'green',
  'orange',
  'purple',
]

export const LINE_TYPES: readonly LineType[] = [
  'route',
  'block',
  'path',
  'motion',
  'dashedRoute',
  'segmentedBlock',
  'checkRelease',
]

export const LINE_LABEL: Record<LineType, string> = {
  route: 'Solid arrow',
  block: 'T-cap',
  path: 'Plain line',
  motion: 'Squiggly',
  dashedRoute: 'Dashed arrow',
  segmentedBlock: 'Segmented T',
  checkRelease: 'Dot end',
}

/** Field-position views. They change what the field shows, never the diagram. */
export type FieldPreset = 'midfield' | 'redzone' | 'goalline' | 'backedUp'

export const FIELD_PRESETS: Record<FieldPreset, { label: string; yardLine: number }> = {
  midfield: { label: 'Midfield', yardLine: 50 },
  redzone: { label: 'Redzone', yardLine: 80 },
  goalline: { label: 'Goalline', yardLine: 97 },
  backedUp: { label: 'Backed up', yardLine: 5 },
}
