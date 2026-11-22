import type { StaffMember } from '../data/scoutTasks'
import type { Folder } from './folders'
import type { Me, Pack, ScoutTask } from './scoutPacks'

/**
 * No-backend demo: a Lincoln High pack for the week of Nov 23 inside the demo
 * Opponents > Lincoln High folder, delegated to the staff below.
 */
export const DEMO_PACK_FOLDERS: Folder[] = [
  {
    id: 'demo-pack',
    name: 'Week of Nov 23',
    parentId: 'lincoln',
    kind: 'opponent',
    archived: false,
    side: 'defense',
  },
  { id: 'demo-run', name: 'Run Game', parentId: 'demo-pack', kind: 'opponent', archived: false },
  { id: 'demo-pass', name: 'Pass Game', parentId: 'demo-pack', kind: 'opponent', archived: false },
  {
    id: 'demo-st',
    name: 'Special Teams',
    parentId: 'demo-pack',
    kind: 'opponent',
    archived: false,
  },
  {
    id: 'demo-tend',
    name: 'Tendencies',
    parentId: 'demo-pack',
    kind: 'opponent',
    archived: false,
  },
]

export const DEMO_PACKS: Pack[] = [{ id: 'demo-pack', week: '2026-11-23' }]

export const DEMO_STAFF: StaffMember[] = [
  { userId: 'demo-kim', name: 'Coach Kim', role: 'head_coach', side: null, groups: [] },
  { userId: 'demo-diaz', name: 'Coach Diaz', role: 'coach', side: 'defense', groups: ['LB'] },
  { userId: 'demo-reyes', name: 'Coach Reyes', role: 'coach', side: null, groups: ['DL'] },
  { userId: 'demo-park', name: 'Coach Park', role: 'coach', side: 'offense', groups: [] },
]

/** The playbook demo is the head coach; the Coach Home demo is the DC, who runs the LB room. */
export const DEMO_HEAD_COACH: Me = { userId: 'demo-kim', groups: [] }
export const DEMO_ASSIGNEE: Me = { userId: 'demo-diaz', groups: ['LB'] }

export const DEMO_TASKS: ScoutTask[] = [
  {
    id: 'demo-task-run-dl',
    folderId: 'demo-run',
    parentTaskId: null,
    userId: null,
    group: 'DL',
    dueAt: '2026-11-25T23:59:59.000Z',
    status: 'in_progress',
    note: 'Chart their inside zone and power looks',
    statusBy: 'demo-reyes',
    statusAt: '2026-11-22T18:00:00.000Z',
    createdBy: 'demo-kim',
  },
  {
    id: 'demo-task-run-lb',
    folderId: 'demo-run',
    parentTaskId: null,
    userId: null,
    group: 'LB',
    dueAt: '2026-11-25T23:59:59.000Z',
    status: 'todo',
    note: null,
    statusBy: null,
    statusAt: null,
    createdBy: 'demo-kim',
  },
  {
    id: 'demo-task-pass',
    folderId: 'demo-pass',
    parentTaskId: null,
    userId: 'demo-diaz',
    group: null,
    dueAt: '2026-11-26T23:59:59.000Z',
    status: 'todo',
    note: 'Third down concepts',
    statusBy: null,
    statusAt: null,
    createdBy: 'demo-kim',
  },
  {
    id: 'demo-task-tend',
    folderId: 'demo-tend',
    parentTaskId: null,
    userId: 'demo-park',
    group: null,
    dueAt: '2026-11-24T23:59:59.000Z',
    status: 'ready',
    note: null,
    statusBy: 'demo-park',
    statusAt: '2026-11-23T20:00:00.000Z',
    createdBy: 'demo-kim',
  },
]
