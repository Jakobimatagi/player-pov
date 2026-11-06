import { describe, expect, it } from 'vitest'
import {
  fieldToScreen,
  fitView,
  HIT_RADIUS_PX,
  hitTest,
  screenToField,
  type View,
} from '../src/editor/hitTest'
import { chartLayout } from '../src/editor/state'
import type { LookSource, PlaySource } from '../src/play/sourceTypes'

/** One receiver with a two-leg route and one corner far away, ball on the 25 in the middle. */
const SOURCE: PlaySource = {
  sourceVersion: 1,
  name: 'Hit test',
  side: 'offense',
  ballSpot: { yardLine: 25, hash: 'M' },
  duration: 3,
  ball: { snap: 'shotgun', segments: [] },
  adjustments: [],
  players: [
    {
      slot: 'x',
      position: 'WR',
      align: { dx: 0, dy: 10 },
      legs: [
        { to: { dx: 6, dy: 0 }, dur: 1 },
        { to: { dx: 0, dy: -6 }, dur: 1 },
      ],
    },
    { slot: 'y', position: 'TE', align: { dx: 0, dy: 12 }, legs: [] },
  ],
}
const LOOK: LookSource = {
  id: 'l',
  name: 'L',
  side: 'defense',
  players: [{ slot: 'cb', position: 'CB', align: { dx: 10, dy: -25 }, legs: [] }],
}
const S = { source: SOURCE, look: LOOK }
const LOS = 35
const BALL_Y = chartLayout(S).ballY

const SCALES = [2, 4, 8, 16, 32, 64]
const ROTATIONS = [0, 90] as const
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (deg * Math.PI) / 180)

function view(scale: number, rotate: 0 | 90): View {
  return { scale, originX: 13, originY: -7, rotate }
}

describe('screen ↔ field', () => {
  it.each(ROTATIONS)('round-trips at rotate %i', (rotate) => {
    for (const scale of SCALES) {
      const v = view(scale, rotate)
      for (const [x, y] of [
        [0, 0],
        [35, 26.67],
        [119, 53],
        [61.25, 3.5],
      ] as const) {
        const { px, py } = fieldToScreen(x, y, v)
        const back = screenToField(px, py, v)
        expect(back.x).toBeCloseTo(x, 9)
        expect(back.y).toBeCloseTo(y, 9)
      }
    }
  })

  it('draws the offense moving right in landscape and up in portrait', () => {
    const land = view(10, 0)
    expect(fieldToScreen(50, 20, land).px).toBeGreaterThan(fieldToScreen(40, 20, land).px)
    // The offense's left (+y) is up on screen.
    expect(fieldToScreen(40, 30, land).py).toBeLessThan(fieldToScreen(40, 20, land).py)
    const port = view(10, 90)
    expect(fieldToScreen(50, 20, port).py).toBeLessThan(fieldToScreen(40, 20, port).py)
    expect(fieldToScreen(40, 30, port).px).toBeLessThan(fieldToScreen(40, 20, port).px)
  })

  it('fitView keeps the window and the full width on screen', () => {
    for (const rotate of ROTATIONS) {
      const v = fitView(800, 450, { x0: 20, x1: 60 }, rotate)
      const corners = [
        fieldToScreen(20, 0, v),
        fieldToScreen(60, 53.333, v),
        fieldToScreen(20, 53.333, v),
        fieldToScreen(60, 0, v),
      ]
      for (const c of corners) {
        expect(c.px).toBeGreaterThanOrEqual(-1e-6)
        expect(c.px).toBeLessThanOrEqual(800 + 1e-6)
        expect(c.py).toBeGreaterThanOrEqual(-1e-6)
        expect(c.py).toBeLessThanOrEqual(450 + 1e-6)
      }
    }
  })
})

describe('hitTest', () => {
  it('uses a 44px target', () => {
    expect(HIT_RADIUS_PX * 2).toBe(44)
  })

  // The corner stands alone, so the only thing near it is the corner itself.
  for (const rotate of ROTATIONS) {
    for (const scale of SCALES) {
      it(`hits a player within 22px and misses past it at ${scale}px/yd, rotate ${rotate}`, () => {
        const v = view(scale, rotate)
        const cb = fieldToScreen(LOS + 10, BALL_Y - 25, v)
        for (const a of ANGLES) {
          const inside = hitTest(
            S,
            cb.px + Math.cos(a) * (HIT_RADIUS_PX - 0.5),
            cb.py + Math.sin(a) * (HIT_RADIUS_PX - 0.5),
            v,
          )
          expect(inside).toEqual({ kind: 'player', ref: { side: 'theirs', slot: 'cb' } })
          const outside = hitTest(
            S,
            cb.px + Math.cos(a) * (HIT_RADIUS_PX + 0.5),
            cb.py + Math.sin(a) * (HIT_RADIUS_PX + 0.5),
            v,
          )
          expect(outside.kind).not.toBe('player')
        }
      })
    }
  }

  it('returns the field point when nothing is near', () => {
    const v = view(10, 0)
    const { px, py } = fieldToScreen(80, 5, v)
    const hit = hitTest(S, px, py, v)
    expect(hit.kind).toBe('field')
    if (hit.kind !== 'field') return
    expect(hit.x).toBeCloseTo(80, 9)
    expect(hit.y).toBeCloseTo(5, 9)
  })

  it('prefers a waypoint over the player it overlaps', () => {
    const tight: PlaySource = {
      ...SOURCE,
      players: [
        {
          slot: 'x',
          position: 'WR',
          align: { dx: 0, dy: 10 },
          legs: [{ to: { dx: 0.5, dy: 0 }, dur: 1 }],
        },
      ],
    }
    const v = view(10, 0)
    const x = fieldToScreen(LOS, BALL_Y + 10, v)
    expect(hitTest({ source: tight, look: LOOK }, x.px, x.py, v)).toEqual({
      kind: 'waypoint',
      ref: { side: 'ours', slot: 'x', leg: 0 },
    })
  })

  it('hits a waypoint by leg index', () => {
    const v = view(10, 0)
    const end = fieldToScreen(LOS + 6, BALL_Y + 4, v)
    expect(hitTest(S, end.px + 5, end.py - 5, v)).toEqual({
      kind: 'waypoint',
      ref: { side: 'ours', slot: 'x', leg: 1 },
    })
  })

  it('hits a segment with its position along the leg', () => {
    const v = view(10, 0)
    const mid = fieldToScreen(LOS + 3, BALL_Y + 10, v)
    const hit = hitTest(S, mid.px, mid.py + 8, v)
    expect(hit.kind).toBe('segment')
    if (hit.kind !== 'segment') return
    expect(hit.ref).toEqual({ side: 'ours', slot: 'x', leg: 0 })
    expect(hit.t).toBeCloseTo(0.5, 6)
  })

  it('picks the nearer player when two targets overlap', () => {
    // x at dy 10 and y at dy 12 are 2 yd apart: 20px at 10px/yd, so both are in reach.
    const v = view(10, 0)
    const x = fieldToScreen(LOS, BALL_Y + 10, v)
    const y = fieldToScreen(LOS, BALL_Y + 12, v)
    const nearY = { px: (x.px + y.px) / 2, py: x.py + (y.py - x.py) * 0.6 }
    expect(hitTest(S, nearY.px, nearY.py, v)).toEqual({
      kind: 'player',
      ref: { side: 'ours', slot: 'y' },
    })
    const nearX = { px: (x.px + y.px) / 2, py: x.py + (y.py - x.py) * 0.4 }
    expect(hitTest(S, nearX.px, nearX.py, v)).toEqual({
      kind: 'player',
      ref: { side: 'ours', slot: 'x' },
    })
  })
})
