import type { PositionRule, RuleFields } from '../data/rules'
import { compileChart } from '../editor/compileAdapter'
import { buildPlaybook } from '../playbook/playbooks'
import type { PlayFile } from '../play/types'

export const DEMO_PLAY_NAME = 'Trips Flood'

/** The no-backend demo: Trips Flood from the Trips Package template, partly answered. */
export function demoPlay(): PlayFile {
  const play = buildPlaybook('trips').find((item) => item.source.name === DEMO_PLAY_NAME)
  const chart = play == null ? null : compileChart(play.source, play.look)
  if (chart?.play == null) throw new Error('demo play did not compile')
  return chart.play
}

const answers: Record<string, Partial<RuleFields>> = {
  qb: {
    alignment: 'Gun, 5 yards, heels on the ball.',
    assignment: 'Flood read: corner → flat → check down.',
    adjustment: 'Two-high: peek the backside dig first. Blitz: hot to the RB in the flat.',
    keyRead: 'Flat defender (the curl/flat player to the trips side).',
    recognize: 'Sinks under the corner = flat is open. Widens with the flat = corner window.',
    react: 'Hitch and throw. Ball out by the top of the drop; never hold it past three.',
  },
  x: {
    alignment: 'Backside, top of the numbers. On the ball.',
    assignment: 'Dig at 12. Backside outlet if the flood is covered.',
    adjustment:
      'vs press: inside release and push to 14. Motion to trips: alert for the throwback.',
    keyRead: 'Backside hook defender (the Will).',
    recognize: 'Will runs with the RB = window opens behind him. Will sinks = sit in front of him.',
    react: 'Break flat across his face and show your numbers to the QB. Catch and turn upfield.',
  },
  h: {
    alignment: 'Inside slot, 2 yards outside the tackle, off the ball.',
    assignment: 'Corner at 10, aim for 18 on the sideline.',
    adjustment: 'vs MOFC (one high), flatten the corner at 15 to stay under the safety.',
    keyRead: 'Near safety’s hips.',
    recognize: 'Safety carries the seam = corner is open. Safety widens = break back to the post.',
    react: 'Stay on the corner path, eyes back at the break, catch it over the outside shoulder.',
  },
  y: {
    alignment: 'Wing, 1 yard outside and 1 back from the RT.',
    assignment: 'Flat route at 2 yards, get to the numbers.',
    adjustment: 'vs edge blitz from your side, chip the end first, then release.',
    keyRead: 'Flat defender.',
    recognize: 'Flat defender sinks = ball is coming now. Jumps you = corner behind him.',
    react: 'Turn upfield on the catch. Never drift back toward the QB.',
  },
  rb: {
    alignment: 'Left of the QB, toes at his heels.',
    assignment: 'Check release: scan A to B gap, then swing.',
  },
  fs: {
    assignment: 'Deep middle third.',
    keyRead: 'QB’s eyes, then #2 to the trips side.',
  },
}

export function demoRules(): PositionRule[] {
  return Object.entries(answers).map(([slot, fields]) => ({
    slot,
    side: slot === 'fs' ? 'defense' : 'offense',
    alignment: fields.alignment ?? '',
    assignment: fields.assignment ?? '',
    adjustment: fields.adjustment ?? '',
    keyRead: fields.keyRead ?? '',
    recognize: fields.recognize ?? '',
    react: fields.react ?? '',
    notes: fields.notes ?? '',
    updatedAt: '2026-11-21T00:00:00.000Z',
  }))
}
