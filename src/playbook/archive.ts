import type { Assignment } from '../data/assignments'
import type { PlayRow } from '../data/plays'
import type { TeamPlayer } from '../data/slots'
import type { Folder, FolderLink } from './folders'

export const DEMO_PLAYS: PlayRow[] = [
  {
    id: 'flood',
    team_id: 'demo',
    name: 'Flood',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    published_at: '2026-10-24T00:00:00.000Z',
  },
  {
    id: 'iso',
    team_id: 'demo',
    name: 'Iso',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    published_at: null,
  },
]

/** Our Playbooks > Base Offense (Flood), and Opponents > Lincoln High. Iso is unfiled. */
export const DEMO_FOLDERS: Folder[] = [
  { id: 'ours', name: 'Our Playbooks', parentId: null, kind: 'playbook', archived: false },
  { id: 'base', name: 'Base Offense', parentId: 'ours', kind: 'playbook', archived: false },
  { id: 'opp', name: 'Opponents', parentId: null, kind: 'opponent', archived: false },
  { id: 'lincoln', name: 'Lincoln High', parentId: 'opp', kind: 'opponent', archived: false },
]

export const DEMO_LINKS: FolderLink[] = [{ folderId: 'base', playId: 'flood' }]

/** Base Offense is assigned to the quarterbacks in the demo. */
export const DEMO_ASSIGNMENTS: Assignment[] = [
  { id: 'demo-asg-qb', playbookId: 'base', group: 'QB', userId: null, dueAt: null },
]

export const DEMO_TEAM_PLAYERS: TeamPlayer[] = [
  { userId: 'demo-p1', name: 'Jordan Reyes', position: 'QB' },
  { userId: 'demo-p2', name: 'Marcus Hill', position: 'FS' },
  { userId: 'demo-p3', name: 'Andre Cole', position: 'WR' },
]

export const DEMO_ARCHIVED: PlayRow[] = [
  {
    id: 'mesh',
    team_id: 'demo',
    name: 'Mesh',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    published_at: null,
  },
]

export interface ArchiveView {
  list: 'active' | 'archived'
  active: PlayRow[]
  archived: PlayRow[]
  notice: string | null
  success: string | null
}

export function visiblePlays(input: {
  staff: boolean
  list: 'active' | 'archived'
  active: PlayRow[]
  archived: PlayRow[]
  search: string
}): PlayRow[] {
  const pool = input.staff && input.list === 'archived' ? input.archived : input.active
  const query = input.search.trim().toLowerCase()
  return pool.filter((play) => play.name.toLowerCase().includes(query))
}

export function afterRestore(
  view: ArchiveView,
  playId: string,
  error: unknown | null,
): ArchiveView {
  if (error != null) {
    const notice =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Could not restore this play'
    return { ...view, notice, success: null }
  }
  const play = view.archived.find((row) => row.id === playId)
  if (play == null) {
    return { ...view, notice: 'Could not restore this play', success: null }
  }
  return {
    list: 'active',
    active: [...view.active, play].sort((a, b) => a.name.localeCompare(b.name)),
    archived: view.archived.filter((row) => row.id !== playId),
    notice: null,
    success: `${play.name} restored`,
  }
}

export function listStatus(input: {
  loading: boolean
  count: number
  archived: boolean
}): string | null {
  if (input.loading) return 'Loading…'
  if (input.count === 0) return input.archived ? 'No archived plays' : 'No plays'
  return null
}

/** `?roster=demo` is a fixture only when Supabase is unset, or when the app is in dev. */
export function honorDemoRoster(
  roster: string | null,
  supabaseConfigured: boolean,
  dev: boolean,
): boolean {
  return roster === 'demo' && (!supabaseConfigured || dev)
}
