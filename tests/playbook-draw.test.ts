import { describe, expect, it } from 'vitest'
import { FORMATIONS, offenseFormations } from '../src/editor/formations'
import { effectiveFormation, type Folder } from '../src/playbook/folders'
import { drawnPlayError, formationPlay } from '../src/playbook/newPlays'

const folder = (id: string, parentId: string | null, baseFormation?: string): Folder => ({
  id,
  name: id,
  parentId,
  kind: 'playbook',
  archived: false,
  baseFormation: baseFormation ?? null,
})

describe('base alignment', () => {
  it('uses the nearest folder with one, else null', () => {
    const tree = [folder('a', null, 'pro-rt'), folder('b', 'a'), folder('c', 'b', 'trips-rt')]
    expect(effectiveFormation(tree, 'b')).toBe('pro-rt')
    expect(effectiveFormation(tree, 'c')).toBe('trips-rt')
    expect(effectiveFormation([folder('x', null)], 'x')).toBeNull()
    expect(effectiveFormation(tree, null)).toBeNull()
  })

  it('lists only offense presets', () => {
    const keys = offenseFormations().map(([key]) => key)
    expect(keys).toEqual(['trips-rt', 'gun-spread', 'pro-rt'])
  })
})

describe('formationPlay', () => {
  it('lines every preset up with no routes and compiles', () => {
    for (const [key] of offenseFormations()) {
      const play = formationPlay(key, '  Hitch  ')
      expect(play.source.name).toBe('Hitch')
      expect(play.source.players).toHaveLength(FORMATIONS[key]?.players.length ?? -1)
      expect(play.source.players.every((p) => p.legs.length === 0)).toBe(true)
      expect(drawnPlayError(play)).toBeNull()
    }
  })

  it('falls back to the default for an unknown or missing key', () => {
    expect(formationPlay(null, 'a').source.formation).toBe('Gun Spread')
    expect(formationPlay('nope', 'a').source.formation).toBe('Gun Spread')
  })

  it('snaps under center for a pro set', () => {
    expect(formationPlay('pro-rt', 'a').source.ball.snap).toBe('under-center')
  })
})
