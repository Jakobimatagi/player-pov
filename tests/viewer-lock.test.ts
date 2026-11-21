import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayerHome } from '../src/app/PlayerHome'
import {
  attachPlayer,
  cameraState,
  detachPlayer,
  lockToPlayer,
  notePlay,
  selectMode,
  unlockPlayer,
  watchPlayer,
} from '../src/camera/cameraState'
import { groupSlots, slotIndex } from '../src/data/slots'
import { viewerAccess } from '../src/viewer/access'

const ids = ['qb', 'x', 'cb1', 'fs'] as const

function reset(): void {
  cameraState.lockedTo = -1
  cameraState.mode = 'broadcast'
  cameraState.attached = -1
  cameraState.watchAs = -1
  cameraState.povSubject = -1
  cameraState.playId = 'play-a'
}

describe('viewer access', () => {
  const base = { backend: true, savedPlay: true, slotLoaded: true, ids }

  it('leaves coaches and the no-backend viewer free', () => {
    expect(viewerAccess({ ...base, role: 'head_coach', slot: null })).toEqual({
      kind: 'free',
      staff: true,
    })
    expect(viewerAccess({ ...base, role: 'coach', slot: 'fs' }).kind).toBe('free')
    expect(viewerAccess({ ...base, backend: false, role: null, slot: null })).toEqual({
      kind: 'free',
      staff: false,
    })
  })

  it('locks a player to their slot', () => {
    expect(viewerAccess({ ...base, role: 'player', slot: 'fs' })).toEqual({
      kind: 'locked',
      slot: 'fs',
      index: 3,
    })
  })

  it('waits for the slot before deciding', () => {
    expect(viewerAccess({ ...base, role: 'player', slot: null, slotLoaded: false }).kind).toBe(
      'loading',
    )
  })

  it('marks a player with no slot, or a slot the play lacks, as unassigned', () => {
    expect(viewerAccess({ ...base, role: 'player', slot: null }).kind).toBe('unassigned')
    expect(viewerAccess({ ...base, role: 'player', slot: 'mike' })).toEqual({
      kind: 'unassigned',
      slot: 'mike',
    })
  })
})

describe('viewer access failures', () => {
  const base = { backend: true, savedPlay: true, slotLoaded: true, ids }

  it('never unlocks a player when their slot fails to load', () => {
    expect(viewerAccess({ ...base, role: 'player', slot: null, slotError: true }).kind).toBe(
      'error',
    )
  })

  it('treats a failed membership load as an error, not a free viewer', () => {
    expect(viewerAccess({ ...base, role: null, slot: null, membershipError: true }).kind).toBe(
      'error',
    )
  })

  it('lets players watch demo plays freely, with no unassigned note', () => {
    expect(viewerAccess({ ...base, savedPlay: false, role: 'player', slot: null })).toEqual({
      kind: 'free',
      staff: false,
    })
  })
})

describe('camera lock', () => {
  beforeEach(reset)

  it('attaches the locked player and starts in their helmet', () => {
    lockToPlayer(3, 0)
    expect(cameraState.lockedTo).toBe(3)
    expect(cameraState.attached).toBe(3)
    expect(cameraState.mode).toBe('pov')
    expect(cameraState.povSubject).toBe(3)
  })

  it('ignores attach, detach and Watch as for anyone else', () => {
    lockToPlayer(3, 0)
    attachPlayer(1, 0)
    watchPlayer(2, 0, 0)
    detachPlayer()
    expect(cameraState.attached).toBe(3)
  })

  it('keeps Broadcast and Top-down on the locked player', () => {
    lockToPlayer(3, 0)
    selectMode('broadcast', 0, 1)
    expect(cameraState.mode).toBe('broadcast')
    expect(cameraState.attached).toBe(3)
    selectMode('topdown', 0, 2)
    expect(cameraState.attached).toBe(3)
    selectMode('pov', 0, 3)
    expect(cameraState.povSubject).toBe(3)
  })

  it('releases on unlock and on a new play', () => {
    lockToPlayer(3, 0)
    unlockPlayer()
    attachPlayer(1, 0)
    expect(cameraState.attached).toBe(1)
    lockToPlayer(2, 0)
    notePlay('play-b', 0)
    expect(cameraState.lockedTo).toBe(-1)
    expect(cameraState.attached).toBe(-1)
  })
})

describe('slot helpers', () => {
  it('finds a slot in the play', () => {
    expect(slotIndex({ ids }, 'cb1')).toBe(2)
    expect(slotIndex({ ids }, 'mike')).toBe(-1)
    expect(slotIndex({ ids }, null)).toBe(-1)
  })

  it('groups players by slot', () => {
    const grouped = groupSlots([
      { userId: 'a', slot: 'fs' },
      { userId: 'b', slot: 'fs' },
      { userId: 'c', slot: 'cb1' },
    ])
    expect(grouped.get('fs')).toEqual(['a', 'b'])
    expect(grouped.get('cb1')).toEqual(['c'])
  })
})

describe('player home', () => {
  function render(plays: Parameters<typeof PlayerHome>[0]['initial']): string {
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(PlayerHome, {
          name: 'p@example.com',
          teamId: 't',
          userId: 'u',
          initial: plays,
        }),
      ),
    )
  }

  it('lists assigned plays with the player position', () => {
    const html = render([
      { id: 'p1', name: 'Cover 2 vs Trips', side: 'defense', slot: 'fs' },
      { id: 'p2', name: 'Blitz Zero', side: 'defense', slot: null },
    ])
    expect(html).toContain('Player Home')
    expect(html).toContain('href="/plays/p1"')
    expect(html).toContain('Your position: FS')
    expect(html).toContain('No position assigned yet')
  })

  it('says when nothing is assigned', () => {
    expect(render([])).toContain('Nothing assigned yet. Check with your coach.')
  })
})
