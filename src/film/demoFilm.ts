import type { Film } from '../data/film'

const GIB = 1024 ** 3

/** Shown with no backend, so the page can be reviewed and tested. */
export const DEMO_FILMS: Film[] = [
  {
    id: 'demo-1',
    teamId: 'demo',
    folderId: 'demo-week',
    title: 'Lincoln at Central',
    opponent: 'Lincoln High',
    gameDate: '2026-11-20',
    sizeBytes: 1.6 * GIB,
    durationMs: 5_520_000,
    status: 'ready',
    createdAt: '2026-11-21T15:00:00Z',
  },
  {
    id: 'demo-2',
    teamId: 'demo',
    folderId: null,
    title: 'Week 11 vs Eastside',
    opponent: 'Eastside',
    gameDate: '2026-11-13',
    sizeBytes: 1.4 * GIB,
    durationMs: 4_980_000,
    status: 'ready',
    createdAt: '2026-11-14T15:00:00Z',
  },
  {
    id: 'demo-3',
    teamId: 'demo',
    folderId: null,
    title: 'Scrimmage end zone',
    opponent: null,
    gameDate: '2026-08-15',
    sizeBytes: 0.9 * GIB,
    durationMs: null,
    status: 'uploading',
    createdAt: '2026-08-16T15:00:00Z',
  },
]

export const DEMO_USAGE = { used: 3.9 * GIB, quota: 10 * GIB }
