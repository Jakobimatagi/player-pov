import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import sampleJson from '../public/plays/trips-right-vs-cover2.json'
import { fetchPlay, parseJson, validatePlay } from '../src/play/load'
import { z } from 'zod'
import { PlaySchema } from '../src/play/schema'
import type { PlayFile } from '../src/play/types'
import { LoadError } from '../src/ui/LoadError'
import { formatLoadErrors } from '../src/ui/formatErrors'

type Inferred = z.infer<typeof PlaySchema>
const _assignToPlayFile: PlayFile = null as unknown as Inferred
void _assignToPlayFile

function clone(play: PlayFile = sampleJson as PlayFile): PlayFile {
  return structuredClone(play)
}

type PythonOutcome = { ok: boolean; stdout: string } | { skipped: true }

let jsonschemaReady: boolean | null = null

function hasJsonschema(): boolean {
  if (jsonschemaReady != null) return jsonschemaReady
  try {
    execFileSync('python3', ['-c', 'import jsonschema'], { stdio: 'pipe' })
    jsonschemaReady = true
  } catch {
    jsonschemaReady = false
    console.warn(
      'Skipping validate.py parity: Python module jsonschema is missing. Install it with: pip install -r schema/requirements.txt',
    )
  }
  return jsonschemaReady
}

function pythonResult(play: unknown): PythonOutcome {
  if (!hasJsonschema()) return { skipped: true }
  const dir = mkdtempSync(join(tmpdir(), 'play-'))
  const file = join(dir, 'play.json')
  writeFileSync(file, JSON.stringify(play))
  try {
    const stdout = execFileSync(
      'python3',
      ['schema/validate.py', file, 'schema/play.schema.json', '--warn'],
      { encoding: 'utf8' },
    )
    return { ok: true, stdout }
  } catch (err) {
    const failure = err as { status?: number; stdout?: string; stderr?: string }
    const stderr = failure.stderr ?? ''
    if (stderr.includes('jsonschema')) {
      console.warn(
        'Skipping validate.py parity: Python module jsonschema is missing. Install it with: pip install -r schema/requirements.txt',
      )
      return { skipped: true }
    }
    if (failure.status === 1) return { ok: false, stdout: failure.stdout ?? '' }
    throw err
  }
}

function expectSameVerdict(play: unknown): void {
  const ts = validatePlay(play)
  const py = pythonResult(play)
  if ('skipped' in py) return
  expect(ts.ok).toBe(py.ok)
}

function pathsOf(play: unknown): string[] {
  const result = validatePlay(play)
  expect(result.ok).toBe(false)
  if (result.ok) return []
  return result.errors.map((error) => error.path)
}

describe('sample play', () => {
  it('passes schema and semantic checks and matches validate.py', () => {
    const result = validatePlay(sampleJson)
    expect(result.ok).toBe(true)
    expectSameVerdict(sampleJson)
  })

  it('accepts a pre-snap waypoint at t = -1.5', () => {
    const play = clone()
    const player = play.players[0]
    expect(player).toBeDefined()
    if (player == null) return
    player.waypoints[0]!.t = -1.5
    const result = validatePlay(play)
    expect(result.ok).toBe(true)
    expectSameVerdict(play)
  })
})

describe('rejected plays', () => {
  it('rejects 21 players on the players path', () => {
    const play = clone()
    play.players.pop()
    expect(pathsOf(play).some((path) => path === 'players' || path.startsWith('players'))).toBe(
      true,
    )
    expectSameVerdict(play)
  })

  it('rejects a duplicate jersey', () => {
    const play = clone()
    play.players[1]!.jersey = play.players[0]!.jersey
    expect(pathsOf(play)).toContain('players[1].jersey')
    expectSameVerdict(play)
  })

  it('rejects a non-increasing time', () => {
    const play = clone()
    const wps = play.players[0]!.waypoints
    wps[1]!.t = wps[0]!.t - 0.2
    const result = validatePlay(play)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const hit = result.errors.find((error) => error.path === 'players[0].waypoints[1].t')
      expect(hit?.message).toContain('must be greater than previous')
    }
    expectSameVerdict(play)
  })

  it('rejects a last t that is not the duration', () => {
    const play = clone()
    const wps = play.players[0]!.waypoints
    wps[wps.length - 1]!.t = play.meta.duration - 0.5
    expect(pathsOf(play)).toContain(`players[0].waypoints[${wps.length - 1}].t`)
    expectSameVerdict(play)
  })

  it('rejects a ball gap', () => {
    const play = clone()
    const seg = play.ball.segments[0]
    if (seg == null) throw new Error('missing segment')
    seg.t1 = 0.2
    expect(pathsOf(play)).toContain('ball.segments[0].t1')
    expectSameVerdict(play)
  })

  it('rejects an unknown ball carrier', () => {
    const play = clone()
    const seg = play.ball.segments[1]
    if (seg == null || seg.kind !== 'carried') throw new Error('expected carried')
    seg.carrier = 'nobody'
    expect(pathsOf(play)).toContain('ball.segments[1].carrier')
    expectSameVerdict(play)
  })

  it('rejects a broken handoff chain', () => {
    const play = clone()
    const seg = play.ball.segments[1]
    if (seg == null || seg.kind !== 'carried') throw new Error('expected carried')
    seg.carrier = 'c'
    const result = validatePlay(play)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.message.includes('handoff mismatch'))).toBe(true)
    }
    expectSameVerdict(play)
  })

  it('rejects a 15 yd/s segment', () => {
    const play = clone()
    const wps = play.players.find((player) => player.id === 'qb')!.waypoints
    wps[1]!.x = wps[0]!.x + 10
    const result = validatePlay(play)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.message.includes('yd/s > 11'))).toBe(true)
    }
    expectSameVerdict(play)
  })

  it('rejects offense across the line of scrimmage', () => {
    const play = clone()
    const player = play.players.find((item) => item.id === 'qb')!
    player.waypoints[0]!.x = play.meta.lineOfScrimmageX + 1
    const result = validatePlay(play)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.message.includes('wrong side of LOS'))).toBe(true)
    }
    expectSameVerdict(play)
  })

  it('rejects an unknown key', () => {
    const play = clone() as PlayFile & { extra?: boolean }
    play.extra = true
    const result = validatePlay(play)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.errors.some(
          (error) => error.message.toLowerCase().includes('extra') || error.path.includes('extra'),
        ),
      ).toBe(true)
    }
    expectSameVerdict(play)
  })

  it('rejects a flight to an unknown id and a gap as a fumble-shaped ball', () => {
    const unknown = clone()
    const flight = unknown.ball.segments[2]
    if (flight == null || flight.kind !== 'flight') throw new Error('expected flight')
    flight.to = 'loose'
    expect(validatePlay(unknown).ok).toBe(false)
    expectSameVerdict(unknown)

    const gap = clone()
    gap.ball.segments[2]!.t0 = 2.4
    expect(validatePlay(gap).ok).toBe(false)
    expectSameVerdict(gap)
  })
})

describe('warnings', () => {
  it('warns, and still loads, when two players are 0.3 yd apart at the snap', () => {
    const play = clone()
    const a = play.players[0]!
    const b = play.players[1]!
    b.waypoints[0]!.x = a.waypoints[0]!.x
    b.waypoints[0]!.y = a.waypoints[0]!.y + 0.3
    const result = validatePlay(play)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.warnings.some((warning) => warning.message.includes('within 0.5 yd'))).toBe(
        true,
      )
    }
    const py = pythonResult(play)
    if (!('skipped' in py)) {
      expect(py.ok).toBe(true)
      expect(py.stdout).toContain('WARN snap')
    }
  })
})

describe('load failures', () => {
  it('reports schemaVersion 2 before other checks', () => {
    const play = clone()
    const versioned: { schemaVersion: number } = play
    versioned.schemaVersion = 2
    const result = validatePlay(play)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toEqual([
        {
          kind: 'version',
          path: 'schemaVersion',
          message: 'unsupported play format v2',
        },
      ])
    }
  })

  it('includes line and column for non-JSON', () => {
    const parsed = parseJson('{')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toMatch(/line \d+ column \d+/)
  })

  it('reports HTTP 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    )
    const result = await fetchPlay('/plays/missing.json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]?.message).toBe('HTTP 404')
    vi.unstubAllGlobals()
  })

  it('reports an HTML 200 as not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )
    const result = await fetchPlay('/plays/missing.json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]?.kind).toBe('network')
      expect(result.errors[0]?.message).toBe('not found')
    }
    vi.unstubAllGlobals()
  })

  it('reports a non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('{', { status: 200, headers: { 'content-type': 'text/plain' } }),
      ),
    )
    const result = await fetchPlay('/plays/bad.json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]?.kind).toBe('parse')
      expect(result.errors[0]?.message).toMatch(/line \d+ column \d+/)
    }
    vi.unstubAllGlobals()
  })
})

describe('LoadError screen', () => {
  it('lists 50 lines plus the remainder, grouped by player', () => {
    const play = clone()
    const duration = play.meta.duration
    const fill = (index: number, pairs: number) => {
      const player = play.players[index]!
      const x = player.team === 'offense' ? 30 : 40
      const points = []
      // `pairs` strictly decreasing steps (all t >= -10), then a legal finish at duration.
      // Six waypoints is the schema cap, so four decreasing steps fit with that finish.
      for (let i = 0; i <= pairs; i += 1) {
        points.push({ t: -i * 0.2, x, y: 26, face: 0 })
      }
      points.push({ t: duration, x, y: 26, face: 0 })
      player.waypoints = points
    }
    for (let i = 0; i < 15; i += 1) fill(i, 4)
    const result = validatePlay(play)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(60)
    const formatted = formatLoadErrors(result.errors)
    const shown = formatted.groups.reduce((sum, group) => sum + group.lines.length, 0)
    expect(shown).toBe(50)
    expect(formatted.more).toBe(10)
    expect(formatted.groups[0]?.id).toBe(play.players[0]!.id)
    expect(formatted.groups[1]?.id).toBe(play.players[1]!.id)

    const html = renderToStaticMarkup(
      createElement(LoadError, {
        errors: result.errors,
        url: '/plays/bad.json',
        onRetry: () => undefined,
      }),
    )
    expect(html).toContain('Couldn&#x27;t load this play')
    expect(html).toContain('…and 10 more')
    expect(html).toContain(play.players[0]!.id)
    expect(html).not.toContain('Share')
    expect(html).not.toContain('Browse')
  })

  it('shows the version message', () => {
    const html = renderToStaticMarkup(
      createElement(LoadError, {
        errors: [{ kind: 'version', path: 'schemaVersion', message: 'unsupported play format v2' }],
        url: '/plays/next.json',
        onRetry: () => undefined,
      }),
    )
    expect(html).toContain('unsupported play format v2')
    expect(html).toContain('/plays/next.json')
  })
})
