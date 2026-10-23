import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { checksumSource, compileChart } from '../src/editor/compileAdapter'
import { canonicalJson } from '../src/play/canonical'
import { COVER_2_LOOK, COVER_3_LOOK } from '../src/play/cover2Look'
import { playChecksum } from '../src/play/nodeChecksum'
import type { LookSource, PlaySource } from '../src/play/sourceTypes'
import { loadPlayInput, playInputFromLocation, PLAY_FIXTURES } from '../src/play/usePlay'

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

  it('pins a known checksum and ignores key order', async () => {
    const canonical = '{"a":0,"b":1,"n":1e+21}'
    const vector = { b: 1, a: -0, drop: undefined, n: 1e21 }
    const swapped = { n: 1e21, a: -0, b: 1 }
    expect(canonicalJson(vector)).toBe(canonical)
    expect(canonicalJson(swapped)).toBe(canonicalJson(vector))
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
    expect(canonicalJson(-0)).toBe('0')
    expect(canonicalJson(1e21)).toBe('1e+21')
    const digest = 'd5354d02222a4666fd1326c81334cbf3af9c949769d7ce2b6235f8e908028f3a'
    expect(playChecksum(vector)).toBe(digest)
    expect(await checksumSource(vector as unknown as PlaySource)).toBe(digest)
    expect(await checksumSource(swapped as unknown as PlaySource)).toBe(playChecksum(vector))
  })

  it('asks for HTTPS when WebCrypto is missing', async () => {
    const subtle = crypto.subtle
    Object.defineProperty(crypto, 'subtle', { configurable: true, value: undefined })
    await expect(checksumSource({} as PlaySource)).rejects.toThrow(/needs HTTPS/)
    Object.defineProperty(crypto, 'subtle', { configurable: true, value: subtle })
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
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('/plays/${loaded.play.meta.id}/edit')
    expect(readFileSync('src/App.tsx', 'utf8')).not.toContain('navigate(-1)')
    expect(readFileSync('src/app/router.tsx', 'utf8')).toContain('/watch/draft/:draftKey')
    vi.unstubAllGlobals()
  })

  it('shows an error for a malformed draft', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
    })
    memory.set(
      'draft:bad-shape',
      JSON.stringify({ source: { sourceVersion: 1, players: [{}] }, look: { players: [{}] } }),
    )
    const result = await loadPlayInput({ kind: 'draft', key: 'bad-shape' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.url).toBe('/watch/draft/bad-shape')
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.every((error) => error.kind === 'schema')).toBe(true)
    }
    vi.unstubAllGlobals()
  })

  it('rejects a draft over 64KB before parsing', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
    })
    memory.set('draft:huge-1', `{${'a'.repeat(64 * 1024)}`)
    const result = await loadPlayInput({ kind: 'draft', key: 'huge-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]?.message).toBe('draft is over 64KB')
    vi.unstubAllGlobals()
  })

  it('does not read fixture or draft keys off the prototype chain', async () => {
    const fetchMock = vi.fn()
    const reads: string[] = []
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => {
        reads.push(key)
        return null
      },
    })
    const inherited = await loadPlayInput({ kind: 'id', playId: 'constructor' })
    expect(inherited.ok).toBe(false)
    if (!inherited.ok) expect(inherited.errors[0]?.message).toBe('not found')
    expect(fetchMock).not.toHaveBeenCalled()
    const draft = await loadPlayInput({ kind: 'draft', key: '__proto__' })
    expect(draft.ok).toBe(false)
    if (!draft.ok) expect(draft.errors[0]?.message).toBe('not found')
    expect(reads).toEqual([])
    expect(Object.hasOwn(PLAY_FIXTURES, 'trips-right-flood-vs-cover2')).toBe(true)
    vi.unstubAllGlobals()
  })
})
