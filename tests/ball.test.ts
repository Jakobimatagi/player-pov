import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sampleJson from '../public/plays/trips-right-vs-cover2.json'
import { sampleBall } from '../src/play/ball'
import { compilePlay } from '../src/play/compile'
import { SAMPLE_PLAY_URL, playUrlFromSearch } from '../src/play/load'
import { samplePlayer } from '../src/play/sample'
import type { BallPose, CompiledPlay, PlayFile, PlayerPose } from '../src/play/types'
import { buildBallGeometry } from '../src/scene/ballGeometry'

const HAND_FORWARD = 0.35
const HAND_UP = 1.1

function freshPose(): PlayerPose {
  return { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 }
}

function ballPose(): BallPose {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, carrierIndex: -1 }
}

function fill(play: CompiledPlay, t: number) {
  const xy = new Float32Array(play.count * 2)
  const heading = new Float32Array(play.count)
  const vel = new Float32Array(play.count * 2)
  const pose = freshPose()
  for (let i = 0; i < play.count; i += 1) {
    samplePlayer(play, i, t, 1, pose)
    xy[i * 2] = pose.x
    xy[i * 2 + 1] = pose.y
    heading[i] = pose.heading
    vel[i * 2] = pose.vx
    vel[i * 2 + 1] = pose.vy
  }
  return { xy, heading, vel }
}

function hand(play: CompiledPlay, id: string, t: number) {
  const index = play.ids.indexOf(id)
  const pose = samplePlayer(play, index, t, 1, freshPose())
  return {
    index,
    x: pose.x + Math.cos(pose.heading) * HAND_FORWARD,
    y: pose.y + Math.sin(pose.heading) * HAND_FORWARD,
    z: HAND_UP,
    vx: pose.vx,
    vy: pose.vy,
  }
}

describe('ball', () => {
  const play = compilePlay(sampleJson as PlayFile)

  it('rides the carrier hand and takes that velocity', () => {
    const t = 1
    const sampled = fill(play, t)
    const qb = hand(play, 'qb', t)
    const out = sampleBall(play, t, sampled.xy, sampled.heading, sampled.vel, ballPose())
    expect(out.carrierIndex).toBe(qb.index)
    expect(out.x).toBeCloseTo(qb.x, 4)
    expect(out.y).toBeCloseTo(qb.y, 4)
    expect(out.z).toBeCloseTo(qb.z, 4)
    expect(out.vx).toBeCloseTo(qb.vx, 4)
    expect(out.vy).toBeCloseTo(qb.vy, 4)
  })

  it('keeps flight height continuous and peaks at the apex plus the endpoint lerp', () => {
    const start = 2
    const end = 2.9
    const mid = (start + end) / 2
    const from = hand(play, 'qb', start)
    const to = hand(play, 'h', end)
    const at = (t: number) => {
      const sampled = fill(play, t)
      return sampleBall(play, t, sampled.xy, sampled.heading, sampled.vel, ballPose())
    }
    const leave = at(start)
    const arrive = at(end - 1e-4)
    const peak = at(mid)
    const flight = 2
    expect(leave.z).toBeCloseTo(from.z, 4)
    expect(leave.x).toBeCloseTo(from.x, 4)
    expect(leave.y).toBeCloseTo(from.y, 4)
    expect(leave.carrierIndex).toBe(-1)
    expect(play.ball.x1[flight]).toBeCloseTo(to.x, 4)
    expect(play.ball.y1[flight]).toBeCloseTo(to.y, 4)
    expect(play.ball.z1[flight]).toBeCloseTo(to.z, 4)
    expect(arrive.z).toBeCloseTo(to.z, 1)
    expect(arrive.x).toBeCloseTo(to.x, 2)
    expect(arrive.y).toBeCloseTo(to.y, 2)
    const lerpZ = (from.z + to.z) / 2
    expect(peak.z).toBeCloseTo(lerpZ + 3, 4)
  })

  it('is in H’s hand at the catch', () => {
    const t = 2.9
    const sampled = fill(play, t)
    const h = hand(play, 'h', t)
    const out = sampleBall(play, t, sampled.xy, sampled.heading, sampled.vel, ballPose())
    expect(out.carrierIndex).toBe(h.index)
    expect(out.x).toBeCloseTo(h.x, 4)
    expect(out.y).toBeCloseTo(h.y, 4)
    expect(out.z).toBeCloseTo(h.z, 4)
  })

  it('holds position before the first segment and after the last', () => {
    const before = fill(play, -0.2)
    const early = sampleBall(play, -0.2, before.xy, before.heading, before.vel, ballPose())
    const snap = hand(play, 'c', 0)
    expect(early.x).toBeCloseTo(snap.x, 4)
    expect(early.y).toBeCloseTo(snap.y, 4)
    expect(early.z).toBeCloseTo(snap.z, 4)
    expect(early.vx).toBe(0)

    const after = fill(play, 5)
    const late = sampleBall(play, 5, after.xy, after.heading, after.vel, ballPose())
    const finish = hand(play, 'h', 4)
    expect(late.x).toBeCloseTo(finish.x, 4)
    expect(late.y).toBeCloseTo(finish.y, 4)
    expect(late.z).toBeCloseTo(finish.z, 4)
    expect(late.carrierIndex).toBe(finish.index)
  })

  it('is one 80-triangle mesh', () => {
    const geometry = buildBallGeometry()
    const index = geometry.getIndex()
    expect(index).not.toBeNull()
    expect((index?.count ?? 0) / 3).toBe(80)
    const source = readFileSync('src/scene/Ball.tsx', 'utf8')
    expect(source.match(/<mesh\b/g)?.length).toBe(1)
    const players = readFileSync('src/scene/Players.tsx', 'utf8')
    expect(players.match(/samplePlayer\(/g)?.length).toBe(1)
  })
})

describe('play url', () => {
  it('accepts a /plays fixture and ignores anything else', () => {
    expect(playUrlFromSearch('')).toBe(SAMPLE_PLAY_URL)
    expect(playUrlFromSearch('?play=/plays/missing.json')).toBe('/plays/missing.json')
    expect(playUrlFromSearch('?play=https://evil.example/x.json')).toBe(SAMPLE_PLAY_URL)
    expect(playUrlFromSearch('?play=/plays/../secret.json')).toBe(SAMPLE_PLAY_URL)
  })
})
