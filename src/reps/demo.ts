import type { Homework, RepAssignment, RepResult, ScoutRep } from '../data/reps'
import type { TeamPlayer } from '../data/slots'
import { compileChart } from '../editor/compileAdapter'
import { buildPlaybook } from '../playbook/playbooks'
import { COVER_2_LOOK, COVER_3_LOOK } from '../play/cover2Look'
import type { LookSource, PlaySource } from '../play/sourceTypes'
import { defaultTarget } from './target'

/**
 * No-backend demo for scout reps: Trips Flood against Cover 3 (as charted) and Cover 2,
 * two reps, a few receivers with results, and one player's homework.
 */
export const DEMO_REP_PLAY_ID = 'demo'

export interface DemoRepPlay {
  id: string
  teamId: string
  name: string
  side: 'offense' | 'defense'
  publishedAt: string | null
  source: PlaySource
  defaultLookId: string
}

export interface DemoLook {
  id: string
  name: string
  source: LookSource
}

export function demoRepPlay(): DemoRepPlay {
  const play = buildPlaybook('trips').find((item) => item.source.name === 'Trips Flood')
  if (play == null) throw new Error('demo play missing')
  return {
    id: DEMO_REP_PLAY_ID,
    teamId: 'demo',
    name: 'Trips Flood',
    side: 'offense',
    publishedAt: '2026-11-18T00:00:00.000Z',
    source: play.source,
    defaultLookId: 'look-c3',
  }
}

export const DEMO_REP_LOOKS: DemoLook[] = [
  { id: 'look-c3', name: 'Cover 3', source: COVER_3_LOOK },
  { id: 'look-c2', name: 'Cover 2 (4-3 Over)', source: COVER_2_LOOK },
]

export const DEMO_REP_PLAYERS: TeamPlayer[] = [
  { userId: 'p-kai', name: 'Kai Brooks', position: 'WR' },
  { userId: 'p-devin', name: 'Devin Ross', position: 'WR' },
  { userId: 'p-jalen', name: 'Jalen Ortiz', position: 'WR' },
  { userId: 'p-tyler', name: 'Tyler Shaw', position: 'TE' },
  { userId: 'p-marcus', name: 'Marcus Hill', position: 'QB' },
]

function targetFor(look: LookSource, slot: string) {
  const file = compileChart(demoRepPlay().source, look).play
  return (file == null ? null : defaultTarget(file, slot)) ?? { x: 10, y: 0 }
}

export function demoReps(): ScoutRep[] {
  const corner = targetFor(COVER_3_LOOK, 'h')
  const flat = targetFor(COVER_2_LOOK, 'y')
  return [
    {
      id: 'rep-h',
      teamId: 'demo',
      playId: DEMO_REP_PLAY_ID,
      lookId: 'look-c3',
      slot: 'h',
      target: corner,
      tolerance: 2,
      note: 'Finish the corner at 18 on the sideline. Stay on top of the flat defender.',
      createdAt: '2026-11-18T00:00:00.000Z',
    },
    {
      id: 'rep-y',
      teamId: 'demo',
      playId: DEMO_REP_PLAY_ID,
      lookId: 'look-c2',
      slot: 'y',
      // Against Cover 2 the flat is squatted, so the coach moved Y's spot up to 5 yards.
      target: { x: Math.round((flat.x + 3) * 10) / 10, y: flat.y },
      tolerance: 2.5,
      note: 'Cover 2 corner squats the flat: push to 5 and sit in the window.',
      createdAt: '2026-11-19T00:00:00.000Z',
    },
  ]
}

export const DEMO_REP_ASSIGNMENTS: RepAssignment[] = [
  { id: 'asg-wr', repId: 'rep-h', group: 'WR', userId: null, dueAt: '2026-11-24T23:59:59.000Z' },
  {
    id: 'asg-tyler',
    repId: 'rep-y',
    group: null,
    userId: 'p-tyler',
    dueAt: '2026-11-20T23:59:59.000Z',
  },
]

export const DEMO_REP_RESULTS: RepResult[] = [
  {
    assignmentId: 'asg-wr',
    repId: 'rep-h',
    userId: 'p-kai',
    dueAt: '2026-11-24T23:59:59.000Z',
    attempts: 1,
    firstDistance: 1.2,
    firstPassed: true,
    bestDistance: 1.2,
    passed: true,
    lastAt: '2026-11-20T19:12:00.000Z',
  },
  {
    assignmentId: 'asg-wr',
    repId: 'rep-h',
    userId: 'p-devin',
    dueAt: '2026-11-24T23:59:59.000Z',
    attempts: 3,
    firstDistance: 6.4,
    firstPassed: false,
    bestDistance: 1.8,
    passed: true,
    lastAt: '2026-11-21T08:40:00.000Z',
  },
  {
    assignmentId: 'asg-wr',
    repId: 'rep-h',
    userId: 'p-jalen',
    dueAt: '2026-11-24T23:59:59.000Z',
    attempts: 2,
    firstDistance: 7.9,
    firstPassed: false,
    bestDistance: 4.3,
    passed: false,
    lastAt: '2026-11-21T07:05:00.000Z',
  },
  {
    assignmentId: 'asg-tyler',
    repId: 'rep-y',
    userId: 'p-tyler',
    dueAt: '2026-11-20T23:59:59.000Z',
    attempts: 0,
    firstDistance: null,
    firstPassed: null,
    bestDistance: null,
    passed: false,
    lastAt: null,
  },
]

/** Jalen's list: the corner rep (not started) and an overdue one. */
export function demoHomework(): Homework[] {
  return [
    {
      assignmentId: 'asg-wr',
      repId: 'rep-h',
      playId: DEMO_REP_PLAY_ID,
      playName: 'Trips Flood',
      playSide: 'offense',
      lookId: 'look-c3',
      lookName: 'Cover 3',
      slot: 'h',
      dueAt: '2026-11-24T23:59:59.000Z',
      assignedAt: '2026-11-18T00:00:00.000Z',
      attempts: 0,
      passed: false,
      bestDistance: null,
      last: null,
      target: null,
      tolerance: null,
      note: null,
    },
    {
      assignmentId: 'asg-wr-2',
      repId: 'rep-x',
      playId: DEMO_REP_PLAY_ID,
      playName: 'Trips Flood',
      playSide: 'offense',
      lookId: 'look-c2',
      lookName: 'Cover 2 (4-3 Over)',
      slot: 'x',
      dueAt: '2026-11-20T23:59:59.000Z',
      assignedAt: '2026-11-16T00:00:00.000Z',
      attempts: 1,
      passed: false,
      bestDistance: 4.1,
      last: null,
      target: null,
      tolerance: null,
      note: null,
    },
    {
      assignmentId: 'asg-wr-3',
      repId: 'rep-z',
      playId: DEMO_REP_PLAY_ID,
      playName: 'Trips Flood',
      playSide: 'offense',
      lookId: 'look-c3',
      lookName: 'Cover 3',
      slot: 'z',
      dueAt: null,
      assignedAt: '2026-11-12T00:00:00.000Z',
      attempts: 2,
      passed: true,
      bestDistance: 0.9,
      last: null,
      target: null,
      tolerance: null,
      note: null,
    },
  ]
}

/** The hidden answer for a demo homework row, standing in for the server. */
export function demoAnswer(item: Homework): {
  target: { x: number; y: number }
  tolerance: number
  note: string
} {
  const rep = demoReps().find((r) => r.id === item.repId)
  if (rep != null) return { target: rep.target, tolerance: rep.tolerance, note: rep.note }
  const look = DEMO_REP_LOOKS.find((l) => l.id === item.lookId)?.source ?? COVER_3_LOOK
  return { target: targetFor(look, item.slot), tolerance: 2, note: '' }
}
