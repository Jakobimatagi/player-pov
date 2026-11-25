import type { FilmStatus } from '../data/database.types'
import { formatBytes } from './uploadPlan'

/** What a coach sees for each film state. */
export function statusLabel(status: FilmStatus): string {
  switch (status) {
    case 'uploading':
      return 'Upload not finished'
    case 'processing':
      return 'Processing'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'Upload failed'
    case 'local':
      return 'Clips on your computer'
  }
}

/** "Lincoln at Central.mp4" → "Lincoln at Central". */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim()
  return base.slice(0, 120)
}

/** 5400000 → "1:30:00"; 754000 → "12:34". */
export function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return '—'
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "2026-11-20" → "Nov 20, 2026" in the viewer's locale, with no time-zone shift. */
export function formatGameDate(date: string | null): string {
  if (!date) return '—'
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "1.2 GB of 4.0 GB · 30%". */
export function progressLabel(sent: number, total: number): string {
  const pct = total > 0 ? Math.floor((sent / total) * 100) : 0
  return `${formatBytes(sent)} of ${formatBytes(total)} · ${pct}%`
}

/** Share of the team quota used, 0 to 100. */
export function usagePercent(used: number, quota: number): number {
  if (quota <= 0) return 100
  return Math.min(100, Math.max(0, (used / quota) * 100))
}

/** "Lincoln High · Week of Nov 23". */
export function packWeekLabel(opponent: string | null, week: string): string {
  return opponent ? `${opponent} · ${week}` : week
}
