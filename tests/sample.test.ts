import { describe, expect, it } from 'vitest'
import sampleJson from '../public/plays/trips-right-vs-cover2.json'
import { compilePlay } from '../src/play/compile'
import { FIELD_CENTER_Y, yardsToWorld } from '../src/play/coords'
import { samplePlayer, samplePlayers } from '../src/play/sample'
import type { PlayFile, PlayerPose } from '../src/play/types'

const deg = (value: number) => (value * Math.PI) / 180

function pose(): PlayerPose {
  return { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 }
}

function play(tracks: PlayFile['players'], duration = 2): PlayFile {
  return {
    schemaVersion: 1,
    meta: {
      id: 'unit',
      name: 'Unit',
      lineOfScrimmageX: 35,
      ballY: 26.67,
      duration,
      offenseDirection: '+x',
    },
    players: tracks,
    ball: { segments: [{ kind: 'carried', t0: 0, t1: duration, carrier: tracks[0]?.id ?? 'p' }] },
  }
}

function mover(
  waypoints: PlayFile['players'][number]['waypoints'],
  id = 'p',
): PlayFile['players'][number] {
  return { id, team: 'offense', position: 'QB', jersey: 7, waypoints }
}

describe('coords', () => {
  it('maps the ball spot to world x = −25 and z ≈ 0', () => {
    const out = { x: 0, y: 0, z: 0 }
    yardsToWorld(35, FIELD_CENTER_Y, 0, out)
    expect(out.x).toBeCloseTo(-25, 6)
    expect(out.y).toBe(0)
    expect(out.z).toBeCloseTo(0, 6)
  })
})

describe('sampler', () => {
  it('matches every waypoint of the sample play', () => {
    const compiled = compilePlay(sampleJson as PlayFile)
    const out = pose()
    for (let i = 0; i < compiled.count; i += 1) {
      const start = compiled.wpStart[i] ?? 0
      const end = compiled.wpStart[i + 1] ?? start
      for (let k = start; k < end; k += 1) {
        samplePlayer(compiled, i, compiled.wpT[k] ?? 0, 1, out)
        expect(out.x).toBeCloseTo(compiled.wpX[k] ?? 0, 4)
        expect(out.y).toBeCloseTo(compiled.wpY[k] ?? 0, 4)
      }
    }
  })

  it('starts from rest on a smooth segment', () => {
    const compiled = compilePlay(
      play([
        mover([
          { t: 0, x: 30, y: 26, face: 0 },
          { t: 2, x: 40, y: 26 },
        ]),
      ]),
    )
    const out = samplePlayer(compiled, 0, 0, 1, pose())
    expect(out.vx).toBeCloseTo(0, 4)
    expect(out.vy).toBeCloseTo(0, 4)
    expect(out.x).toBeCloseTo(30, 4)
  })

  it('keeps velocity continuous across a smooth waypoint', () => {
    const compiled = compilePlay(
      play([
        mover([
          { t: 0, x: 0, y: 0 },
          { t: 1, x: 5, y: 8 },
          { t: 2, x: 20, y: 0 },
        ]),
      ]),
    )
    const before = samplePlayer(compiled, 0, 1 - 1e-5, 1, pose())
    const bx = before.vx
    const by = before.vy
    const after = samplePlayer(compiled, 0, 1 + 1e-5, 1, pose())
    expect(after.vx).toBeCloseTo(bx, 2)
    expect(after.vy).toBeCloseTo(by, 2)
  })

  it('holds constant speed on a linear segment', () => {
    const compiled = compilePlay(
      play([
        mover([
          { t: 0, x: 0, y: 0, interp: 'linear' },
          { t: 1, x: 10, y: 0 },
          { t: 2, x: 10, y: 10 },
        ]),
      ]),
    )
    const speeds: number[] = []
    for (const t of [0.2, 0.5, 0.8]) {
      const out = samplePlayer(compiled, 0, t, 1, pose())
      speeds.push(out.speed)
      expect(out.x).toBeCloseTo(10 * t, 4)
      expect(out.y).toBeCloseTo(0, 4)
    }
    expect(speeds[0]).toBeCloseTo(10, 4)
    expect(speeds[1]).toBeCloseTo(speeds[0] ?? 0, 4)
    expect(speeds[2]).toBeCloseTo(speeds[0] ?? 0, 4)
  })

  it('clamps outside the track with zero velocity', () => {
    const compiled = compilePlay(
      play(
        [
          mover([
            { t: -1.5, x: 28, y: 20, face: 10 },
            { t: 2, x: 40, y: 22, face: 45 },
          ]),
        ],
        2,
      ),
    )
    const after = samplePlayer(compiled, 0, 2 + 3, 1, pose())
    expect(after.x).toBeCloseTo(40, 4)
    expect(after.y).toBeCloseTo(22, 4)
    expect(after.vx).toBe(0)
    expect(after.vy).toBe(0)
    expect(after.heading).toBeCloseTo(deg(45), 4)

    const before = samplePlayer(compiled, 0, -1.5 - 1, 1, pose())
    expect(before.x).toBeCloseTo(28, 4)
    expect(before.y).toBeCloseTo(20, 4)
    expect(before.vx).toBe(0)
    expect(before.vy).toBe(0)
    expect(before.heading).toBeCloseTo(deg(10), 4)
  })

  it('takes the shortest face arc', () => {
    const compiled = compilePlay(
      play([
        mover([
          { t: 0, x: 30, y: 26, face: 170 },
          { t: 1, x: 30, y: 26, face: -170 },
        ]),
      ]),
    )
    const out = samplePlayer(compiled, 0, 0.5, 1, pose())
    expect(out.heading).toBeCloseTo(Math.PI, 4)
  })

  it('does not change heading below 0.4 yd/s', () => {
    const compiled = compilePlay(
      play([
        mover([
          { t: 0, x: 30, y: 26 },
          { t: 1, x: 30.3, y: 26 },
        ]),
      ]),
    )
    compiled.facingState[0] = 1
    const out = samplePlayer(compiled, 0, 0.5, 0.016, pose())
    expect(out.speed).toBeLessThan(0.4)
    expect(out.heading).toBeCloseTo(1, 5)
  })

  it('resets heading smoothing on a seek', () => {
    const compiled = compilePlay(
      play([
        mover([
          { t: 0, x: 30, y: 20 },
          { t: 1, x: 30, y: 30 },
        ]),
      ]),
    )
    compiled.facingState[0] = 0
    const eased = samplePlayer(compiled, 0, 0.4, 0.016, pose())
    expect(Math.abs(eased.heading - Math.PI / 2)).toBeGreaterThan(0.2)
    const snapped = samplePlayer(compiled, 0, 0.4, 1, pose())
    expect(snapped.heading).toBeCloseTo(Math.PI / 2, 4)
  })

  it('orders the sample offense left to right from the offense view', () => {
    const compiled = compilePlay(sampleJson as PlayFile)
    const ids = Array.from(compiled.hopOrder.offense, (index) => compiled.ids[index])
    expect(ids).toEqual(['x', 'lt', 'lg', 'rb', 'qb', 'c', 'rg', 'rt', 'y', 'h', 'z'])
    expect(compiled.hopOrder.defense).toHaveLength(11)
  })

  it('samples 10k frames with no allocation under 0.02 ms each', () => {
    const compiled = compilePlay(sampleJson as PlayFile)
    const xy = new Float32Array(compiled.count * 2)
    const heading = new Float32Array(compiled.count)
    const gc = (globalThis as { gc?: () => void }).gc
    expect(typeof gc).toBe('function')
    for (let i = 0; i < 2000; i += 1) samplePlayers(compiled, (i % 40) * 0.1, 0.016, xy, heading)
    gc?.()
    const before = process.memoryUsage().heapUsed
    const started = performance.now()
    for (let i = 0; i < 10000; i += 1) {
      samplePlayers(compiled, (i % 250) * 0.016, 0.016, xy, heading)
    }
    const perCall = (performance.now() - started) / 10000
    gc?.()
    const retained = process.memoryUsage().heapUsed - before
    expect(retained).toBeLessThanOrEqual(0)
    expect(perCall).toBeLessThan(0.02)
  })
})
