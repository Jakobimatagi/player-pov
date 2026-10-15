import { describe, expect, it } from 'vitest'
import sampleJson from '../public/plays/trips-right-vs-cover2.json'
import { attachPlayer, cameraState, detachPlayer, povAttached } from '../src/camera/cameraState'
import { hopInTeam, nearestOpponent } from '../src/camera/hop'
import { compilePlay } from '../src/play/compile'
import type { PlayFile } from '../src/play/types'

const play = compilePlay(sampleJson as PlayFile)

function id(index: number): string {
  return play.ids[index] ?? ''
}

describe('hop', () => {
  it('walks the snap order and wraps', () => {
    const qb = play.ids.indexOf('qb')
    const x = play.ids.indexOf('x')
    const z = play.ids.indexOf('z')
    expect(id(hopInTeam(play, qb, 1))).toBe('c')
    expect(id(hopInTeam(play, qb, -1))).toBe('rb')
    expect(id(hopInTeam(play, z, 1))).toBe('x')
    expect(id(hopInTeam(play, x, -1))).toBe('z')
  })

  it('picks the nearest opponent from the positions at this t', () => {
    const xy = new Float32Array(play.count * 2)
    const qb = play.ids.indexOf('qb')
    const mike = play.ids.indexOf('mike')
    xy[qb * 2] = 30
    xy[qb * 2 + 1] = 26
    xy[mike * 2] = 31
    xy[mike * 2 + 1] = 26
    expect(id(nearestOpponent(play, qb, xy))).toBe('mike')
  })

  it('attaches without changing mode, and P enters POV', () => {
    cameraState.mode = 'broadcast'
    cameraState.attached = -1
    const qb = play.ids.indexOf('qb')
    attachPlayer(qb, 10)
    expect(cameraState.attached).toBe(qb)
    expect(cameraState.mode).toBe('broadcast')
    expect(cameraState.transitionUntil).toBeCloseTo(10.6, 5)
    povAttached(qb, 12)
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.attached).toBe(qb)
    detachPlayer()
    expect(cameraState.attached).toBe(-1)
    cameraState.mode = 'broadcast'
  })
})
