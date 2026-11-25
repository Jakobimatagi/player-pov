import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadExport, ReadPlay } from '../src/film/hudlImport'

/**
 * A stand-in for the Supabase client: the three tables in memory, and a log of every
 * request body, so the test can check what would go over the network.
 */
const db = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const tables: { film: Row[]; film_clips: Row[]; film_clip_files: Row[] } = {
    film: [],
    film_clips: [],
    film_clip_files: [],
  }
  const requests: { table: string; op: string; body: unknown }[] = []
  let ids = 0

  function query(table: string) {
    let op: 'select' | 'insert' = 'select'
    let rows: Row[] = []
    const filters: ((r: Row) => boolean)[] = []
    let single = false
    const run = () => {
      requests.push({ table, op, body: op === 'insert' ? rows : null })
      if (op === 'insert') {
        const added = rows.map((r) => ({ id: `${table}-${++ids}`, ...r }))
        tables[table as keyof typeof tables].push(...added)
        return { data: single ? added[0] : added, error: null }
      }
      const found = tables[table as keyof typeof tables].filter((r) => filters.every((f) => f(r)))
      return { data: single ? (found[0] ?? null) : found, error: null }
    }
    const builder = {
      select: () => builder,
      insert: (r: Row | Row[]) => {
        op = 'insert'
        rows = Array.isArray(r) ? r : [r]
        return builder
      },
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v)
        return builder
      },
      in: (col: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[col]))
        return builder
      },
      order: () => builder,
      single: () => {
        single = true
        return builder
      },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        try {
          resolve(run())
        } catch (e) {
          reject(e)
        }
      },
    }
    return builder
  }
  return { tables, requests, client: { from: query } }
})

vi.mock('../src/data/supabase', () => ({ supabase: db.client }))

const { saveImport, previewImport } = await import('../src/data/filmImport')

function exportOf(count: number): ReadExport {
  const plays: ReadPlay[] = []
  for (let n = 1; n <= count; n += 1) {
    const files = ['End Zone', 'Wide']
      .filter((angle) => angle === 'Wide' || (n !== 45 && n !== 95))
      .map((angle) => ({
        angle,
        fileName: `${angle} - Clip ${String(n).padStart(3, '0')}.mp4`,
        durationMs: 6000 + n,
        size: 4_000_000 + n,
        sha256: `${angle === 'Wide' ? 'a' : 'b'}${String(n).padStart(63, '0')}`,
      }))
    plays.push({
      playNumber: n,
      tags: {
        play_number: n,
        side: n % 2 ? 'defense' : 'offense',
        quarter: 1,
        down: 1,
        distance: 10,
        hash: 'M',
        yard_line: -25,
        personnel: '11',
        formation: 'Trips Rt',
        front: null,
        coverage: null,
        result: 'Rush',
        gain_loss: 4,
        tags: { play_type: 'Run' },
      },
      files,
    })
  }
  return {
    plays,
    duplicateRows: [],
    rowsWithoutNumber: 0,
    groups: {
      plays: [],
      angles: ['End Zone', 'Wide'],
      breakdown: 'breakdown.xlsx',
      clipsWithoutRow: [],
      rowsWithoutClip: [],
      duplicates: [],
      ignored: [],
    },
  }
}

function hasBinary(value: unknown): boolean {
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    return true
  if (value && typeof value === 'object') return Object.values(value).some(hasBinary)
  return false
}

const input = (read: ReadExport) => ({
  teamId: 'team-a',
  userId: 'coach-1',
  read,
  details: {
    title: 'Mountain Ridge vs Corner Canyon',
    opponent: 'Corner Canyon',
    gameDate: '2026-10-30',
  },
})

describe('saving a Hudl export', () => {
  beforeEach(() => {
    for (const t of Object.values(db.tables)) t.length = 0
    db.requests.length = 0
  })

  it('creates one local game, 205 clips and 408 clip files', async () => {
    const result = await saveImport(input(exportOf(205)))
    expect(result.existing).toBe(false)
    expect(db.tables.film).toEqual([
      expect.objectContaining({
        id: result.filmId,
        team_id: 'team-a',
        title: 'Mountain Ridge vs Corner Canyon',
        source: 'hudl_export',
      }),
    ])
    expect(db.tables.film[0]).not.toHaveProperty('size_bytes')
    expect(db.tables.film_clips).toHaveLength(205)
    expect(db.tables.film_clip_files).toHaveLength(408)
    expect(db.tables.film_clips.find((c) => c.play_number === 7)).toMatchObject({
      film_id: result.filmId,
      start_ms: 0,
      end_ms: 6007,
      side: 'defense',
      formation: 'Trips Rt',
      gain_loss: 4,
      tags: { play_type: 'Run' },
    })
  })

  it('matches the saved rows when the same export is opened again', async () => {
    const first = await saveImport(input(exportOf(205)))
    db.requests.length = 0

    const preview = await previewImport('team-a', exportOf(205))
    expect(preview.filmId).toBe(first.filmId)
    expect(preview.plan.add).toHaveLength(0)
    expect(preview.plan.matched).toHaveLength(205)

    const again = await saveImport(input(exportOf(205)))
    expect(again).toMatchObject({ filmId: first.filmId, existing: true })
    expect(db.tables.film).toHaveLength(1)
    expect(db.tables.film_clips).toHaveLength(205)
    expect(db.tables.film_clip_files).toHaveLength(408)
    expect(db.requests.filter((r) => r.op === 'insert')).toEqual([])
  })

  it('adds only the plays a longer export has on top', async () => {
    const first = await saveImport(input(exportOf(200)))
    const again = await saveImport(input(exportOf(205)))
    expect(again.filmId).toBe(first.filmId)
    expect(again.plan.add.map((p) => p.playNumber)).toEqual([201, 202, 203, 204, 205])
    expect(db.tables.film_clips).toHaveLength(205)
  })

  it('sends no video bytes, only small metadata batches', async () => {
    await saveImport(input(exportOf(205)))
    expect(db.requests.some((r) => hasBinary(r.body))).toBe(false)
    const largest = Math.max(...db.requests.map((r) => JSON.stringify(r.body ?? null).length))
    expect(largest).toBeLessThan(64 * 1024)
  })
})
