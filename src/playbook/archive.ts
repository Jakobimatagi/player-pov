import type { PlayRow } from '../data/plays'

export interface ListedPlay extends PlayRow {
  playbookId: string | null
}

export const DEMO_PLAYS: ListedPlay[] = [
  {
    id: 'flood',
    team_id: 'demo',
    name: 'Flood',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    playbookId: 'pb1',
  },
  {
    id: 'iso',
    team_id: 'demo',
    name: 'Iso',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    playbookId: null,
  },
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
