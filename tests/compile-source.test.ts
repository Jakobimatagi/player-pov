import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COVER_2_LOOK, COVER_3_LOOK } from '../src/play/cover2Look'
import { compileSource, playChecksum } from '../src/play/compileSource'
import { importPlayFile } from '../src/play/importPlayFile'
import { validatePlay } from '../src/play/load'
import { pythonSemanticErrors } from '../src/play/pythonParity'
import { mapCompiledPath } from '../src/play/sourceMap'
import type { PlaySource } from '../src/play/sourceTypes'
import type { PlayFile } from '../src/play/types'

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function pythonLines(play: unknown): string[] {
  const file = join(tmpdir(), `play-parity-${process.pid}.json`)
  writeFileSync(file, JSON.stringify(play))
  const result = spawnSync('python3', ['schema/validate.py', file, 'schema/play.schema.json'], {
    encoding: 'utf8',
  })
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('OK') && !line.startsWith('WARN'))
}

function endPoint(play: PlayFile, id: string): { x: number; y: number } {
  const player = play.players.find((item) => item.id === id)
  const last = player?.waypoints[player.waypoints.length - 1]
  return { x: last?.x ?? 0, y: last?.y ?? 0 }
}

function snap(play: PlayFile, id: string): { x: number; y: number } {
  const player = play.players.find((item) => item.id === id)
  const first = player?.waypoints[0]
  return { x: first?.x ?? 0, y: first?.y ?? 0 }
}

describe('compile source', () => {
  const sample = readJson<PlayFile>('public/plays/trips-right-vs-cover2.json')
  const trips = readJson<PlaySource>('fixtures/trips-flood.source.json')

  it('round-trips the sample within 1e-6 and stays deterministic', () => {
    const imported = importPlayFile(sample)
    const compiled = compileSource(imported.source, imported.look)
    expect(compiled.play.meta.id).toBe(sample.meta.id)
    expect(compiled.play.meta.lineOfScrimmageX).toBeCloseTo(sample.meta.lineOfScrimmageX, 6)
    expect(compiled.play.meta.ballY).toBeCloseTo(sample.meta.ballY, 6)
    expect(compiled.play.ball.segments).toEqual(sample.ball.segments)
    for (const player of sample.players) {
      const got = compiled.play.players.find((item) => item.id === player.id)
      expect(got?.waypoints).toHaveLength(player.waypoints.length)
      player.waypoints.forEach((point, index) => {
        expect(got?.waypoints[index]?.t).toBeCloseTo(point.t, 6)
        expect(got?.waypoints[index]?.x).toBeCloseTo(point.x, 6)
        expect(got?.waypoints[index]?.y).toBeCloseTo(point.y, 6)
      })
    }
    const checksum = compiled.checksum
    for (let i = 0; i < 100; i += 1) {
      expect(playChecksum(compileSource(imported.source, imported.look).play)).toBe(checksum)
    }
  })

  it('puts Cover 2 corners over #1 for trips and 2x2', () => {
    const tripsPlay = compileSource(trips, COVER_2_LOOK).play
    const strong = snap(tripsPlay, 'z')
    const weak = snap(tripsPlay, 'x')
    const cbStrong = snap(tripsPlay, 'cb_strong')
    const cbWeak = snap(tripsPlay, 'cb_weak')
    expect(Math.hypot(cbStrong.x - strong.x, cbStrong.y - strong.y)).toBeLessThan(1.5)
    expect(Math.hypot(cbWeak.x - weak.x, cbWeak.y - weak.y)).toBeLessThan(1.5)

    const balanced: PlaySource = {
      ...trips,
      id: 'two-by-two',
      formation: '2x2',
      players: trips.players.map((player) => {
        if (player.slot === 'x') return { ...player, align: { dx: -1, dy: 14 } }
        if (player.slot === 'h') return { ...player, align: { dx: -1, dy: 6 } }
        if (player.slot === 'z') return { ...player, align: { dx: -1, dy: -14 } }
        if (player.slot === 'y') return { ...player, position: 'WR', align: { dx: -1, dy: -6 } }
        return player
      }),
    }
    const even = compileSource(balanced, COVER_2_LOOK).play
    const evenStrong = snap(even, 'z')
    const evenWeak = snap(even, 'x')
    expect(
      Math.hypot(
        snap(even, 'cb_strong').x - evenStrong.x,
        snap(even, 'cb_strong').y - evenStrong.y,
      ),
    ).toBeLessThan(1.5)
    expect(
      Math.hypot(snap(even, 'cb_weak').x - evenWeak.x, snap(even, 'cb_weak').y - evenWeak.y),
    ).toBeLessThan(1.5)
  })

  it('applies H only against Cover 3 and maps a 15 yd/s leg', () => {
    const cover2 = compileSource(trips, COVER_2_LOOK).play
    const cover3 = compileSource(trips, COVER_3_LOOK).play
    expect(endPoint(cover2, 'h').x).not.toBeCloseTo(endPoint(cover3, 'h').x, 3)
    const fast = readJson<PlaySource>('fixtures/trips-flood-fast.source.json')
    const compiled = compileSource(fast, COVER_2_LOOK)
    const validated = validatePlay(compiled.play)
    expect(validated.ok).toBe(false)
    if (!validated.ok) {
      const speed = validated.errors.find((error) => error.message.includes('yd/s'))
      expect(speed).toBeTruthy()
      expect(mapCompiledPath(compiled.sourceMap, speed?.path ?? '')).toBe('players[h].legs[2]')
    }
  })

  it('prints a valid play and the fast-leg source path from the CLI', () => {
    const good = spawnSync(
      'npx',
      ['tsx', 'src/play/compileCli.ts', 'fixtures/trips-flood.source.json'],
      {
        encoding: 'utf8',
      },
    )
    expect(good.status).toBe(0)
    const file = join(tmpdir(), `compiled-${process.pid}.json`)
    writeFileSync(file, good.stdout)
    const check = spawnSync('python3', ['schema/validate.py', file, 'schema/play.schema.json'], {
      encoding: 'utf8',
    })
    expect(check.stdout).toContain('OK: schema + semantic checks pass')
    const fast = spawnSync(
      'npx',
      ['tsx', 'src/play/compileCli.ts', 'fixtures/trips-flood-fast.source.json'],
      { encoding: 'utf8' },
    )
    expect(fast.status).toBe(1)
    expect(fast.stdout).toContain('players[h].legs[2]')
  })

  it('matches validate.py on the sample and on a fast leg', () => {
    expect(pythonLines(sample)).toEqual(pythonSemanticErrors(sample))
    const broken = structuredClone(sample)
    const h = broken.players.find((player) => player.id === 'h')
    const point = h?.waypoints[1]
    if (point) point.x += 40
    expect(pythonLines(broken)).toEqual(pythonSemanticErrors(broken))
    expect(pythonSemanticErrors(broken).some((line) => line.includes('h speed'))).toBe(true)
  })
})
