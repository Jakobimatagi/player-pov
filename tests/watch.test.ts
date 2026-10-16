import { describe, expect, it, beforeEach } from 'vitest'
import sampleJson from '../public/plays/trips-right-vs-cover2.json'
import {
  attachPlayer,
  cameraState,
  detachPlayer,
  notePlay,
  selectMode,
  watchPlayer,
} from '../src/camera/cameraState'
import { hopInTeam } from '../src/camera/hop'
import { compilePlay } from '../src/play/compile'
import type { PlayFile } from '../src/play/types'
import { watchChoices, watchLabel } from '../src/ui/watchLabel'

const play = compilePlay(sampleJson as PlayFile)

function reset(): void {
  cameraState.mode = 'broadcast'
  cameraState.attached = -1
  cameraState.povSubject = -1
  cameraState.watchAs = -1
  cameraState.playId = ''
  cameraState.transitionUntil = 0
  cameraState.movingRef.current = false
}

describe('watch labels', () => {
  it('formats position and jersey, and falls back when the label is missing', () => {
    expect(watchLabel('qb', 'QB', 12)).toBe('QB #12')
    expect(watchLabel('mike', 'LB', 44)).toBe('Mike #44')
    expect(watchLabel('sam', 'LB', 55)).toBe('Sam #55')
    expect(watchLabel('de_l', 'DE', 95)).toBe('DE #95')
    expect(watchLabel('cb_1', '', 24)).toBe('#24')
    expect(watchLabel('cb_1', '   ', 24)).toBe('#24')
  })

  it('groups the sample play into offense and defense in snap order', () => {
    const choices = watchChoices(play)
    expect(choices.offense.map((choice) => choice.label)).toEqual([
      'X #1',
      'LT #76',
      'LG #66',
      'RB #22',
      'QB #7',
      'C #55',
      'RG #64',
      'RT #72',
      'Y #88',
      'H #84',
      'Z #11',
    ])
    expect(choices.defense.find((choice) => choice.id === 'mike')?.label).toBe('Mike #52')
    expect(choices.defense.find((choice) => choice.id === 'de_l')?.label).toBe('DE #95')
    expect(choices.defense.find((choice) => choice.id === 'sam')?.label).toBe('Sam #55')
    expect(choices.defense.find((choice) => choice.id === 'fs')?.label).toBe('FS #29')
  })
})

describe('watch as sync', () => {
  beforeEach(reset)

  it('follows attach and hop, and clears when leaving POV or detaching', () => {
    const qb = play.ids.indexOf('qb')
    attachPlayer(qb, 1)
    expect(cameraState.mode).toBe('broadcast')
    expect(cameraState.watchAs).toBe(qb)

    const next = hopInTeam(play, qb, 1)
    attachPlayer(next, 2)
    expect(play.ids[cameraState.watchAs]).toBe('c')

    selectMode('topdown', qb, 3)
    expect(cameraState.watchAs).toBe(next)

    selectMode('pov', qb, 4)
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.watchAs).toBe(next)

    selectMode('broadcast', qb, 5)
    expect(cameraState.mode).toBe('broadcast')
    expect(cameraState.attached).toBe(next)
    expect(cameraState.watchAs).toBe(-1)

    attachPlayer(next, 6)
    expect(cameraState.watchAs).toBe(next)
    expect(cameraState.mode).toBe('broadcast')

    detachPlayer()
    expect(cameraState.attached).toBe(-1)
    expect(cameraState.watchAs).toBe(-1)
  })

  it('picks a player into POV and does not invent a selection for the fallback QB', () => {
    const mike = play.ids.indexOf('mike')
    watchPlayer(mike, 0, 1)
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.attached).toBe(mike)
    expect(cameraState.watchAs).toBe(mike)

    const will = play.ids.indexOf('will')
    watchPlayer(will, 0, 2)
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.attached).toBe(will)
    expect(cameraState.watchAs).toBe(will)

    detachPlayer()
    selectMode('broadcast', 0, 3)
    selectMode('pov', 0, 4)
    expect(cameraState.attached).toBe(-1)
    expect(cameraState.watchAs).toBe(-1)
    expect(cameraState.povSubject).toBe(0)
  })

  it('clears the selection when the play id changes', () => {
    attachPlayer(4, 1)
    selectMode('pov', 0, 1)
    notePlay('alpha', 1)
    expect(cameraState.playId).toBe('alpha')
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.attached).toBe(-1)
    expect(cameraState.watchAs).toBe(-1)
    expect(cameraState.povSubject).toBe(1)

    attachPlayer(2, 2)
    notePlay('alpha', 1)
    expect(cameraState.attached).toBe(2)
    expect(cameraState.watchAs).toBe(2)

    notePlay('beta', 0)
    expect(cameraState.attached).toBe(-1)
    expect(cameraState.watchAs).toBe(-1)
    expect(cameraState.povSubject).toBe(0)
  })
})
