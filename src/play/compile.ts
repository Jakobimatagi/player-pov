import { samplePlayer } from './sample'
import type { CompiledPlay, PlayFile, PlayerPose, Team } from './types'

const pose: PlayerPose = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 }

function at(arr: ArrayLike<number>, index: number): number {
  return arr[index] ?? 0
}

function snapAxis(p: CompiledPlay, i: number, axis: 'x' | 'y'): number {
  const start = at(p.wpStart, i)
  const end = at(p.wpStart, i + 1)
  const values = axis === 'x' ? p.wpX : p.wpY
  if (at(p.wpT, start) >= 0) return at(values, start)
  for (let k = start; k < end - 1; k += 1) {
    const a = at(p.wpT, k)
    const b = at(p.wpT, k + 1)
    if (a <= 0 && 0 <= b) {
      const span = b - a
      const u = span === 0 ? 0 : -a / span
      return at(values, k) + (at(values, k + 1) - at(values, k)) * u
    }
  }
  return at(values, end - 1)
}

function warnOvershoot(p: CompiledPlay): void {
  for (let i = 0; i < p.count; i += 1) {
    const start = at(p.wpStart, i)
    const end = at(p.wpStart, i + 1)
    for (let k = start; k < end - 1; k += 1) {
      if (at(p.wpLinear, k) === 1) continue
      const dt = at(p.wpT, k + 1) - at(p.wpT, k)
      if (dt <= 0) continue
      const dx = 0.125 * dt * (at(p.tanX, k) - at(p.tanX, k + 1))
      const dy = 0.125 * dt * (at(p.tanY, k) - at(p.tanY, k + 1))
      const stray = Math.hypot(dx, dy)
      if (stray > 1.5) {
        console.warn(
          `overshoot ${p.ids[i] ?? i} segment ${k - start}: ${stray.toFixed(2)} yd from the chord`,
        )
      }
    }
  }
}

function fillTangents(p: CompiledPlay): void {
  for (let i = 0; i < p.count; i += 1) {
    const start = at(p.wpStart, i)
    const end = at(p.wpStart, i + 1)
    for (let k = start; k < end; k += 1) {
      const prev = k > start ? k - 1 : k
      const next = k + 1 < end ? k + 1 : k
      const dt = at(p.wpT, next) - at(p.wpT, prev)
      if (prev === next || dt <= 0) {
        p.tanX[k] = 0
        p.tanY[k] = 0
      } else {
        p.tanX[k] = (at(p.wpX, next) - at(p.wpX, prev)) / dt
        p.tanY[k] = (at(p.wpY, next) - at(p.wpY, prev)) / dt
      }
    }
    const firstLinear = end - start >= 2 && at(p.wpLinear, start) === 1
    if (!firstLinear) {
      p.tanX[start] = 0
      p.tanY[start] = 0
    }
    for (let k = start; k < end - 1; k += 1) {
      if (at(p.wpLinear, k) !== 1) continue
      if (k > start) {
        p.tanX[k] = 0
        p.tanY[k] = 0
      }
      p.tanX[k + 1] = 0
      p.tanY[k + 1] = 0
    }
  }
}

function fillHop(p: CompiledPlay, teams: readonly Team[]): void {
  const offense: number[] = []
  const defense: number[] = []
  for (let i = 0; i < p.count; i += 1) {
    if (teams[i] === 'offense') offense.push(i)
    else defense.push(i)
  }
  const bySnap = (a: number, b: number) => {
    const yb = snapAxis(p, b, 'y')
    const ya = snapAxis(p, a, 'y')
    if (ya !== yb) return yb - ya
    return snapAxis(p, a, 'x') - snapAxis(p, b, 'x')
  }
  offense.sort(bySnap)
  defense.sort(bySnap)
  p.hopOrder.offense = Uint8Array.from(offense)
  p.hopOrder.defense = Uint8Array.from(defense)
}

export function compilePlay(file: PlayFile): CompiledPlay {
  let points = 0
  for (const player of file.players) points += player.waypoints.length
  const count = file.players.length
  const play: CompiledPlay = {
    meta: file.meta,
    count,
    ids: file.players.map((player) => player.id),
    teams: file.players.map((player) => player.team),
    jerseys: new Uint8Array(count),
    positions: file.players.map((player) => player.position),
    wpStart: new Uint16Array(count + 1),
    wpT: new Float32Array(points),
    wpX: new Float32Array(points),
    wpY: new Float32Array(points),
    wpFace: new Float32Array(points),
    wpLinear: new Uint8Array(points),
    tanX: new Float32Array(points),
    tanY: new Float32Array(points),
    hopOrder: { offense: new Uint8Array(0), defense: new Uint8Array(0) },
    facingState: new Float32Array(count),
    segmentCursor: new Uint16Array(count),
  }

  let cursor = 0
  file.players.forEach((player, i) => {
    play.wpStart[i] = cursor
    play.jerseys[i] = player.jersey
    play.segmentCursor[i] = cursor
    for (const wp of player.waypoints) {
      play.wpT[cursor] = wp.t
      play.wpX[cursor] = wp.x
      play.wpY[cursor] = wp.y
      play.wpFace[cursor] = wp.face == null ? Number.NaN : (wp.face * Math.PI) / 180
      play.wpLinear[cursor] = wp.interp === 'linear' ? 1 : 0
      cursor += 1
    }
  })
  play.wpStart[count] = cursor

  fillTangents(play)
  warnOvershoot(play)
  fillHop(play, play.teams)
  for (let i = 0; i < count; i += 1) samplePlayer(play, i, 0, 1, pose)
  return play
}
