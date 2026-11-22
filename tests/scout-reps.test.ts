import { describe, expect, it } from 'vitest'
import { compileChart } from '../src/editor/compileAdapter'
import { buildPlaybook } from '../src/playbook/playbooks'
import { COVER_2_LOOK, COVER_3_LOOK } from '../src/play/cover2Look'
import { boardLayout } from '../src/playsheet/board'
import { assignBlocked } from '../src/data/reps'
import {
  alignSpot,
  clampTolerance,
  defaultTarget,
  describeSpot,
  fromBoard,
  hideRoute,
  homeworkState,
  isValidSpot,
  scoreAttempt,
  sortHomework,
  toBoard,
} from '../src/reps/target'
import type { PlayFile } from '../src/play/types'

function flood(look = COVER_3_LOOK): PlayFile {
  const play = buildPlaybook('trips').find((item) => item.source.name === 'Trips Flood')
  if (play == null) throw new Error('no Trips Flood')
  const file = compileChart(play.source, look).play
  if (file == null) throw new Error('did not compile')
  return file
}

describe('defaultTarget', () => {
  it('is the slot’s last waypoint relative to the ball', () => {
    const file = flood()
    const h = file.players.find((p) => p.id === 'h')!
    const last = h.waypoints[h.waypoints.length - 1]!
    const target = defaultTarget(file, 'h')!
    expect(target.x).toBeCloseTo(last.x - file.meta.lineOfScrimmageX, 2)
    expect(target.y).toBeCloseTo(last.y - file.meta.ballY, 2)
    // The corner route ends well downfield.
    expect(target.x).toBeGreaterThan(8)
  })

  it('differs from where the player lines up', () => {
    const file = flood()
    expect(defaultTarget(file, 'h')).not.toEqual(alignSpot(file, 'h'))
  })

  it('is null for a slot the play does not have', () => {
    expect(defaultTarget(flood(), 'zz')).toBeNull()
  })

  it('is compiled against the rep’s look', () => {
    // Our routes don't change between these looks, but the default still comes from the
    // play compiled with the look, so it is defined for both.
    expect(defaultTarget(flood(COVER_2_LOOK), 'h')).not.toBeNull()
    expect(defaultTarget(flood(COVER_3_LOOK), 'h')).not.toBeNull()
  })
})

describe('scoreAttempt', () => {
  const target = { x: 12, y: -10 }

  it('passes inside the circle and on its edge', () => {
    expect(scoreAttempt(target, 2, { x: 12.5, y: -10.5 }).passed).toBe(true)
    expect(scoreAttempt(target, 2, { x: 14, y: -10 })).toEqual({ distance: 2, passed: true })
  })

  it('fails outside the circle with the distance in yards', () => {
    const score = scoreAttempt(target, 2, { x: 0, y: 0 })
    expect(score.passed).toBe(false)
    expect(score.distance).toBeCloseTo(15.62, 2)
  })

  it('a wider tolerance turns a miss into a pass', () => {
    expect(scoreAttempt(target, 2, { x: 15, y: -10 }).passed).toBe(false)
    expect(scoreAttempt(target, 3, { x: 15, y: -10 }).passed).toBe(true)
  })

  it('clamps tolerance to 1 to 10 yards in half-yard steps', () => {
    expect(clampTolerance(0)).toBe(1)
    expect(clampTolerance(12)).toBe(10)
    expect(clampTolerance(2.3)).toBe(2.5)
    expect(clampTolerance(Number.NaN)).toBe(2)
  })

  it('rejects spots the database would refuse', () => {
    expect(isValidSpot({ x: 10, y: 5 })).toBe(true)
    expect(isValidSpot({ x: 500, y: 0 })).toBe(false)
    expect(isValidSpot({ x: Number.NaN, y: 0 })).toBe(false)
  })
})

describe('board mapping', () => {
  const file = flood()
  const layout = boardLayout(file, 'offense')

  it('puts the ball at the origin', () => {
    expect(toBoard(layout, { x: 0, y: 0 })).toEqual(layout.ball)
  })

  it('round-trips a spot', () => {
    const spot = { x: 12.5, y: -8.3 }
    expect(fromBoard(layout, toBoard(layout, spot))).toEqual(spot)
  })

  it('lands on the slot’s route end', () => {
    const h = layout.players.find((p) => p.id === 'h')!
    const end = h.path[h.path.length - 1]!
    const at = toBoard(layout, defaultTarget(file, 'h')!)
    expect(at.x).toBeCloseTo(end.x, 1)
    expect(at.y).toBeCloseTo(end.y, 1)
  })

  it('hides only the tested player’s route', () => {
    const hidden = hideRoute(layout, 'h')
    expect(hidden.players.find((p) => p.id === 'h')!.path).toHaveLength(1)
    const x = layout.players.find((p) => p.id === 'x')!
    expect(hidden.players.find((p) => p.id === 'x')!.path).toEqual(x.path)
  })
})

describe('homework state', () => {
  const now = new Date('2026-11-21T12:00:00Z')

  it('reads passed, retry, overdue and todo', () => {
    expect(homeworkState({ attempts: 2, passed: true, dueAt: null }, now)).toBe('passed')
    expect(homeworkState({ attempts: 1, passed: false, dueAt: null }, now)).toBe('retry')
    expect(
      homeworkState({ attempts: 1, passed: false, dueAt: '2026-11-20T23:59:59Z' }, now),
    ).toBe('overdue')
    expect(homeworkState({ attempts: 0, passed: false, dueAt: '2026-11-25T23:59:59Z' }, now)).toBe(
      'todo',
    )
  })

  it('sorts overdue first and passed last', () => {
    const rows = [
      { id: 'done', attempts: 1, passed: true, dueAt: null },
      { id: 'later', attempts: 0, passed: false, dueAt: '2026-11-28T00:00:00Z' },
      { id: 'late', attempts: 0, passed: false, dueAt: '2026-11-19T00:00:00Z' },
      { id: 'soon', attempts: 0, passed: false, dueAt: '2026-11-22T00:00:00Z' },
    ]
    expect(sortHomework(rows, now).map((r) => r.id)).toEqual(['late', 'soon', 'later', 'done'])
  })

  it('describes a spot from the player’s side', () => {
    expect(describeSpot({ x: 12, y: -10 }, 'offense')).toBe('12 yds downfield, 10 yds right')
    expect(describeSpot({ x: 12, y: -10 }, 'defense')).toBe('12 yds behind the ball, 10 yds left')
  })

  it('turns guard errors into coach words', () => {
    expect(assignBlocked('publish the play before assigning this rep')).toMatch(/Publish/)
    expect(
      assignBlocked("these players can't see this look yet. Assign them a scout package"),
    ).toMatch(/scout package/)
  })
})
