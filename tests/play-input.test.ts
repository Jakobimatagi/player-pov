import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { COVER_2_LOOK, COVER_3_LOOK } from '../src/play/cover2Look'
import { checksumSource, compileChart } from '../src/editor/compileAdapter'
import { playChecksum } from '../src/play/nodeChecksum'
import { loadPlayInput, playInputFromLocation, PLAY_FIXTURES } from '../src/play/usePlay'
import type { LookSource, PlaySource } from '../src/play/sourceTypes'

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('browser checksum', () => {
  const files = [
    ...readdirSync('fixtures')
      .filter((name) => name.endsWith('.json'))
      .map((name) => `fixtures/${name}`),
    'public/plays/trips-right-vs-cover2.json',
  ]

  it('matches the node checksum on every fixture and both looks', async () => {
    expect(files.length).toBeGreaterThanOrEqual(4)
    for (const file of files) {
      const json = readJson<PlaySource>(file)
      expect(await checksumSource(json)).toBe(playChecksum(json))
    }
    expect(await checksumSource(COVER_2_LOOK)).toBe(playChecksum(COVER_2_LOOK))
    expect(await checksumSource(COVER_3_LOOK)).toBe(playChecksum(COVER_3_LOOK))
  })

  it('keeps node:crypto out of the browser compiler', () => {
    expect(readFileSync('src/play/compileSource.ts', 'utf8')).not.toContain('node:')
    expect(readFileSync('src/editor/compileAdapter.ts', 'utf8')).not.toContain('node:')
    expect(readFileSync('src/play/usePlay.ts', 'utf8')).not.toContain('node:')
  })
})

describe('compileChart', () => {
  const trips = readJson<PlaySource>('fixtures/trips-flood.source.json')

  it('compiles the trips chart without a checksum', () => {
    const chart = compileChart(trips, COVER_2_LOOK)
    expect(chart.errors).toEqual([])
    expect(chart.play?.players).toHaveLength(22)
    expect(chart.compiled?.count).toBe(22)
    expect(chart).not.toHaveProperty('checksum')
  })

  it('maps a fast leg back to the source path', () => {
    const fast = readJson<PlaySource>('fixtures/trips-flood-fast.source.json')
    const chart = compileChart(fast, COVER_2_LOOK)
    expect(chart.play).toBeNull()
    expect(chart.compiled).toBeNull()
    const speed = chart.issues.find((issue) => issue.message.includes('yd/s'))
    expect(speed?.ref).toEqual({ side: 'ours', slot: 'h', leg: 2 })
  })

  it('rejects a look on the same side', () => {
    const offense: LookSource = { ...COVER_2_LOOK, side: 'offense' }
    const chart = compileChart(trips, offense)
    expect(chart.play).toBeNull()
    expect(chart.errors.some((error) => error.path === 'look.side')).toBe(true)
  })
})

describe('play input', () => {
  it('keeps ?play= urls and lets a watch id win', () => {
    expect(playInputFromLocation('?play=/plays/missing.json', {})).toEqual({
      kind: 'url',
      url: '/plays/missing.json',
    })
    expect(playInputFromLocation('?play=https://evil.example/x.json', {})).toEqual({
      kind: 'url',
      url: '/plays/trips-right-vs-cover2.json',
    })
    expect(
      playInputFromLocation('?play=/plays/missing.json', {
        playId: 'trips-right-flood-vs-cover2',
      }),
    ).toEqual({ kind: 'id', playId: 'trips-right-flood-vs-cover2' })
    expect(playInputFromLocation('', { draftKey: 'abc' })).toEqual({ kind: 'draft', key: 'abc' })
  })

  it('loads a known play id from the fixture map', async () => {
    const url = PLAY_FIXTURES['trips-right-flood-vs-cover2']
    const text = readFileSync('public/plays/trips-right-vs-cover2.json', 'utf8')
    const fetchMock = vi.fn(async (requested: string) => {
      expect(requested).toBe(url)
      return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadPlayInput({
      kind: 'id',
      playId: 'trips-right-flood-vs-cover2',
      version: 4,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.play.count).toBe(22)
    expect(fetchMock).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('reports an unknown play id as not found', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadPlayInput({ kind: 'id', playId: 'missing-play' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.url).toBe('/watch/missing-play')
      expect(result.errors[0]?.message).toBe('not found')
    }
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('compiles a draft and rejects a bad key', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    })
    const missing = await loadPlayInput({ kind: 'draft', key: 'nope' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.url).toBe('/watch/draft/nope')
      expect(missing.errors[0]?.message).toBe('not found')
    }

    const source = readJson<PlaySource>('fixtures/trips-flood.source.json')
    memory.set('draft:chart-1', JSON.stringify({ source, look: COVER_2_LOOK }))
    const loaded = await loadPlayInput({ kind: 'draft', key: 'chart-1' })
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.url).toBe('/watch/draft/chart-1')
      expect(loaded.play.count).toBe(22)
    }
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('Back to editor')
    expect(readFileSync('src/app/router.tsx', 'utf8')).toContain('/watch/draft/:draftKey')
    vi.unstubAllGlobals()
  })
})
