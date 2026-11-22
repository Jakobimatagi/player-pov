import type { DepthNote, MyDepthNote, MyDepthSpot } from './depthNotes'

/** The signed-in coach in demo mode (no backend). Acts as head coach. */
export const DEMO_COACH_ID = 'demo-coach'

function daysAgo(days: number, hour = 16): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 15, 0, 0)
  return date.toISOString()
}

function note(
  id: string,
  rosterPlayerId: string,
  slot: string | null,
  body: string,
  shared: boolean,
  author: [string, string],
  days: number,
): DepthNote {
  const at = daysAgo(days)
  return {
    id,
    rosterPlayerId,
    slot,
    body,
    shared,
    sharedAt: shared ? at : null,
    createdBy: author[0],
    authorName: author[1],
    createdAt: at,
    updatedAt: at,
  }
}

const HC: [string, string] = [DEMO_COACH_ID, 'Coach Reyes']
const OC: [string, string] = ['demo-oc', 'Coach Patel']
const DC: [string, string] = ['demo-dc', 'Coach Brooks']

/** Demo notes for /team/depth and /team/roster. Ids match DEMO_ROSTER. */
export const DEMO_NOTES: DepthNote[] = [
  // #76 Sam Kowalski, LT
  note(
    'demo-note-1',
    'demo-9',
    'LT',
    'Strong anchor in pass pro. Hands get wide against speed rushers; keep them inside the frame.',
    true,
    OC,
    9,
  ),
  note(
    'demo-note-2',
    'demo-9',
    null,
    'Talked to his dad after practice: knee is fine, just sore. Keep reps normal.',
    false,
    HC,
    6,
  ),
  note(
    'demo-note-3',
    'demo-9',
    'LT',
    'Needs to be faster off the ball. Keeps the LT spot if pad level stays low through the week.',
    true,
    OC,
    1,
  ),
  // #12 Marcus Hill, QB
  note(
    'demo-note-4',
    'demo-1',
    'QB',
    'Reads the safety rotation well. Speed up the drop on 3-step timing routes.',
    true,
    OC,
    3,
  ),
  // #90 Isaiah Reed, LDE
  note(
    'demo-note-5',
    'demo-14',
    'LDE',
    'Wins with the long arm. Add a counter move before Friday.',
    true,
    DC,
    2,
  ),
  note('demo-note-6', 'demo-14', null, 'Possible move to DT if Russo is out.', false, DC, 2),
  // #7 Devin Cole, QB2 (no account)
  note(
    'demo-note-7',
    'demo-2',
    'QB',
    'Push for the starting job: ball security in the pocket is the gap.',
    false,
    HC,
    4,
  ),
]

/** Player Home demo: the player's spots and the notes shared with them. */
export const DEMO_MY_SPOTS: MyDepthSpot[] = [
  { slot: 'LT', rank: 2, depth: 3 },
  { slot: 'FG_LT', rank: 1, depth: 2 },
]

export const DEMO_MY_NOTES: MyDepthNote[] = DEMO_NOTES.filter(
  (row) => row.rosterPlayerId === 'demo-9' && row.shared,
).map((row) => ({
  id: row.id,
  slot: row.slot,
  body: row.body,
  authorName: row.authorName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  sharedAt: row.sharedAt,
}))
