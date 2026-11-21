import type { PositionCode } from '../data/database.types'
import type { DepthMap, RosterPlayer } from './roster'

/** No-backend demo roster for /team/roster and /team/depth. */
const ROWS: [number, string, PositionCode, PositionCode[], number, number, number][] = [
  [12, 'Marcus Hill', 'QB', [], 2027, 74, 190],
  [7, 'Devin Cole', 'QB', ['S'], 2028, 72, 178],
  [28, 'Jalen Price', 'RB', [], 2027, 69, 185],
  [33, 'Andre Watts', 'RB', ['LB'], 2028, 70, 205],
  [1, 'Trey Moss', 'WR', ['CB'], 2027, 71, 170],
  [4, 'Kai Brooks', 'WR', [], 2029, 68, 160],
  [11, 'Luis Ortega', 'WR', [], 2028, 70, 165],
  [88, 'Ben Turner', 'TE', ['DL'], 2027, 76, 225],
  [76, 'Sam Kowalski', 'OL', [], 2027, 76, 280],
  [66, 'Omar Diaz', 'OL', [], 2028, 74, 265],
  [64, 'Will Grant', 'OL', [], 2027, 73, 255],
  [68, 'Eli Novak', 'OL', ['DL'], 2029, 75, 270],
  [72, 'Chris Young', 'OL', [], 2028, 77, 290],
  [90, 'Isaiah Reed', 'DL', [], 2027, 75, 245],
  [95, 'Tony Russo', 'DL', [], 2028, 73, 260],
  [99, 'Mason Clark', 'DL', ['OL'], 2027, 74, 275],
  [94, 'Jake Fields', 'DL', [], 2029, 76, 240],
  [52, 'Nate Harris', 'LB', [], 2027, 72, 215],
  [44, 'Cole Jensen', 'LB', ['RB'], 2028, 71, 205],
  [55, 'Ray Lopez', 'LB', [], 2027, 73, 220],
  [21, 'Darius King', 'CB', ['WR'], 2027, 70, 172],
  [24, 'Miles Carter', 'CB', [], 2028, 69, 168],
  [3, 'Jordan Bell', 'S', ['CB'], 2027, 72, 185],
  [9, 'Tyler Ross', 'S', [], 2028, 71, 180],
  [17, 'Ethan Park', 'K', [], 2028, 70, 165],
]

export const DEMO_ROSTER: RosterPlayer[] = ROWS.map(
  ([jersey, name, position, altPositions, gradYear, heightIn, weightLb], index) => ({
    id: `demo-${index + 1}`,
    userId: index % 3 === 0 ? `user-${index + 1}` : null,
    name,
    jersey,
    position,
    altPositions,
    gradYear,
    heightIn,
    weightLb,
    notes: '',
  }),
)

function id(jersey: number): string {
  return DEMO_ROSTER.find((player) => player.jersey === jersey)?.id ?? ''
}

export const DEMO_DEPTH: DepthMap = {
  QB: [id(12), id(7)],
  RB: [id(28), id(33)],
  X: [id(1)],
  Z: [id(4)],
  SL: [id(11)],
  Y: [id(88)],
  LT: [id(76)],
  LG: [id(66)],
  C: [id(64)],
  RG: [id(68)],
  RT: [id(72)],
  LDE: [id(90)],
  LDT: [id(95)],
  RDT: [id(99), id(68)],
  RDE: [id(94)],
  MIKE: [id(52)],
  WILL: [id(44)],
  SAM: [id(55)],
  LCB: [id(21)],
  RCB: [id(24)],
  FS: [id(3)],
  SS: [id(9)],
  K: [id(17)],
  P: [id(17)],
  KR: [id(1), id(21)],
}
