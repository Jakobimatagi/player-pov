import type { PositionRule, RuleFields } from '../data/rules'
import type { RuleVariant } from '../data/variants'
import { compileChart } from '../editor/compileAdapter'
import { buildDefenseBook } from '../playbook/defenseTemplates'
import type { NewPlay } from '../playbook/newPlays'
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

const D = (
  alignment: string,
  assignment: string,
  adjustment: string,
  keyRead: string,
  recognize: string,
  react: string,
): Partial<RuleFields> => ({ alignment, assignment, adjustment, keyRead, recognize, react })

/** Cover 3 Sky answers. The backside tackle and end are left unfinished on purpose. */
const coverThree: Record<string, Partial<RuleFields>> = {
  de_s: D(
    'Strong side, 5 technique: outside shade of the tackle.',
    'Contain rush. Nothing gets outside you.',
    'vs a tight end, widen to a 9 technique.',
    'Tackle’s helmet.',
    'Helmet inside = run away / down block. Helmet outside = reach.',
    'Down block: squeeze and spill. Reach: rip across and keep contain.',
  ),
  dt_s: D(
    '1 technique: shade the center to the strength.',
    'A-gap. Two-gap the center on run, push the pocket on pass.',
    'vs under center, tighten to a head-up 0.',
    'Center’s hands and helmet.',
    'Hands to you = run. Center sets back = pass.',
    'Run: hold the A gap and shed. Pass: bull rush and get hands up at the throw.',
  ),
  dt_w: { alignment: '3 technique: outside shade of the weak guard.' },
  de_w: { alignment: 'Weak 5 technique.', assignment: 'Contain rush.' },
  sam: D(
    'Apex between #2 and the end man on the line, 4 yards deep.',
    'Curl/flat to the strength.',
    'vs a tight end on your side, walk up to a 9 technique and set the edge.',
    '#2 receiver.',
    '#2 out = flat threat. #2 vertical = carry to 10, then the curl.',
    'Out: sink under #1’s curl, then break on the flat. Vertical: wall him off the seam.',
  ),
  mike: D(
    '5 yards, over the strong guard.',
    'Middle hook. Fit the strong A gap on run.',
    'vs 2-back sets, stay square; you have the fullback’s side.',
    'Near back to the QB.',
    'Back steps to you = run. QB drops = pass.',
    'Run: downhill to your gap. Pass: open to the strength and sink to 10.',
  ),
  will: D(
    'Weak B gap, 4.5 yards.',
    'Weak hook/curl.',
    'vs 3x1, cheat inside to the weak A gap: the back is your #2.',
    'Weak guard, then the back.',
    'Guard pulls = run strong. Back releases weak = check-down.',
    'Run: flow and scrape. Back release: wall him and rally.',
  ),
  cb_s: D(
    '7 yards off #1, inside shade.',
    'Deep third to the strength.',
    'vs a stacked or bunch #1, back off to 8 and play the deepest man.',
    '#1 receiver’s release, then the QB’s three-step.',
    'Quick game = break on it. #1 vertical = stay on top.',
    'Keep your cushion until he commits, then match vertical and play the ball high.',
  ),
  cb_w: D(
    '7 yards off #1, inside shade.',
    'Deep third, weak side.',
    'vs a single receiver weak, read #1 alone and squeeze inside routes.',
    '#1 receiver.',
    'Inside release = squeeze the post. Outside = sideline third.',
    'Stay on top and outside. No catches over your head.',
  ),
  ss: D(
    'Outside #2 at 7 yards (sky).',
    'Curl/flat to the strength; force on run.',
    'vs a tight end, align 2 outside him at 5 and set the edge.',
    '#2 to #1.',
    '#2 out = jump the flat. #2 vertical = carry and look for #1’s curl.',
    'Run to you: force and turn it in. Pass: sink under the curl, then drive on the flat.',
  ),
  fs: D(
    '12 yards, middle of the field.',
    'Deep middle third. Nothing gets behind you.',
    'Read the formation: favor the side with more receivers by 2 yards.',
    'QB’s eyes, then the closest vertical threat.',
    'QB looks off = stay in the middle. Two verticals inside = split them.',
    'Break on the throw at the top of the drop. Tackle through the hands on anything deep.',
  ),
}

/** Exceptions written for the demo: what changes against 3x1, 12 personnel and the bunch. */
const coverThreeVs: {
  slot: string
  scope: 'look' | 'structure' | 'personnel'
  match: string
  fields: Partial<RuleFields>
}[] = [
  {
    slot: 'fs',
    scope: 'structure',
    match: '3x1',
    fields: {
      alignment: '10 yards, over #3 to the trips side.',
      keyRead: '#3 receiver.',
      react: '#3 vertical: carry him, you are the only help on the seam.',
    },
  },
  {
    slot: 'ss',
    scope: 'personnel',
    match: '12',
    fields: { alignment: 'Down to 5 yards, 2 outside the second tight end.' },
  },
  {
    slot: 'cb_s',
    scope: 'look',
    match: 'lib:gun-bunch-rt',
    fields: {
      alignment: '8 yards off the point man, outside leverage.',
      assignment: 'Deep third: take the first receiver to go vertical out of the bunch.',
    },
  },
]

function ruleRow(slot: string, fields: Partial<RuleFields>, side: 'offense' | 'defense') {
  return {
    slot,
    side,
    alignment: fields.alignment ?? '',
    assignment: fields.assignment ?? '',
    adjustment: fields.adjustment ?? '',
    keyRead: fields.keyRead ?? '',
    recognize: fields.recognize ?? '',
    react: fields.react ?? '',
    notes: fields.notes ?? '',
  }
}

export const DEMO_DEFENSE_ID = 'cover-3'

/** The no-backend defense demo: Cover 3 Sky, with exceptions vs 3x1, 12 personnel and the bunch. */
export function demoDefense(): {
  name: string
  play: NewPlay
  file: PlayFile
  rules: PositionRule[]
  variants: RuleVariant[]
} {
  const play = buildDefenseBook('base-43')[0]
  const chart = play == null ? null : compileChart(play.source, play.look)
  if (play == null || chart?.play == null) throw new Error('demo defense did not compile')
  return {
    name: play.source.name,
    play,
    file: chart.play,
    rules: Object.entries(coverThree).map(([slot, fields]) => ({
      ...ruleRow(slot, fields, 'defense'),
      updatedAt: '2026-11-22T00:00:00.000Z',
    })),
    variants: coverThreeVs.map((item) => ({
      ...ruleRow(item.slot, item.fields, 'defense'),
      scope: item.scope,
      match: item.match,
    })),
  }
}
