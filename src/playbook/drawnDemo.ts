import type { PlayRow } from '../data/plays'
import type { FolderLink } from './folders'
import type { NewPlay } from './newPlays'

/**
 * Plays drawn while there is no backend (the demo). The draw page files them here and
 * the playbook page reads them back, so the + card round-trips without a database.
 * Lives for the page session only.
 */
const drawn: { id: string; folderId: string; play: NewPlay }[] = []

export function addDrawnDemo(folderId: string, play: NewPlay): void {
  drawn.push({ id: `drawn-${drawn.length + 1}`, folderId, play })
}

export function drawnDemoRows(): { rows: PlayRow[]; links: FolderLink[] } {
  return {
    rows: drawn.map(({ id, play }) => ({
      id,
      team_id: 'demo',
      name: play.source.name,
      side: play.source.side,
      current_version: 1,
      default_look_id: null,
      updated_at: '2026-11-05T00:00:00.000Z',
      published_at: null,
    })),
    links: drawn.map(({ id, folderId }) => ({ folderId, playId: id })),
  }
}
