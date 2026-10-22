import type { LookSource } from './sourceTypes'

/** Cover 2 (4-3 Over). Corners anchor to the offense's #1 receivers. */
export const COVER_2_LOOK: LookSource = {
  id: 'cover-2',
  name: 'Cover 2 (4-3 Over)',
  side: 'defense',
  front: '4-3 Over',
  coverage: 'Cover 2',
  players: [
    { slot: 'de_l', position: 'DE', jersey: 90, align: { dx: 1, dy: 4 }, face: 180, legs: [] },
    { slot: 'dt_l', position: 'DT', jersey: 93, align: { dx: 1, dy: 1.5 }, face: 180, legs: [] },
    { slot: 'dt_r', position: 'DT', jersey: 97, align: { dx: 1, dy: -1.5 }, face: 180, legs: [] },
    { slot: 'de_r', position: 'DE', jersey: 95, align: { dx: 1, dy: -4 }, face: 180, legs: [] },
    { slot: 'sam', position: 'LB', jersey: 54, align: { dx: 3, dy: 6 }, face: 180, legs: [] },
    { slot: 'mike', position: 'LB', jersey: 55, align: { dx: 4, dy: 0 }, face: 180, legs: [] },
    { slot: 'will', position: 'LB', jersey: 58, align: { dx: 3, dy: -6 }, face: 180, legs: [] },
    {
      slot: 'cb_strong',
      position: 'CB',
      jersey: 21,
      align: { anchor: 'strong#1', dx: 1, dy: 0 },
      face: 180,
      legs: [],
    },
    {
      slot: 'cb_weak',
      position: 'CB',
      jersey: 24,
      align: { anchor: 'weak#1', dx: 1, dy: 0 },
      face: 180,
      legs: [],
    },
    { slot: 'ss', position: 'S', jersey: 2, align: { dx: 12, dy: -8 }, face: 200, legs: [] },
    { slot: 'fs', position: 'S', jersey: 8, align: { dx: 12, dy: 8 }, face: 160, legs: [] },
  ],
}

export const COVER_3_LOOK: LookSource = {
  ...COVER_2_LOOK,
  id: 'cover-3',
  name: 'Cover 3',
  coverage: 'Cover 3',
}
