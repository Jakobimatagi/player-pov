import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { editorReducer, type EditorAction } from '../src/editor/actions'
import { EditorCanvas } from '../src/editor/EditorCanvas'
import { PlayThumbnail } from '../src/editor/PlayThumbnail'
import { playerColor, routeColor } from '../src/editor/routeKinds'
import {
  blankPlay,
  copyPlay,
  goTo,
  insertAfter,
  move,
  positionLabel,
  putCurrent,
  removeAt,
  type Script,
} from '../src/editor/script'
import { createEditorState, findPlayer, MAX_PLAYERS, type EditorState } from '../src/editor/state'
import { COVER_2_LOOK } from '../src/play/cover2Look'
import { PlaySourceSchema } from '../src/play/sourceSchema'
import type { PlaySource } from '../src/play/sourceTypes'

const FIXTURE = JSON.parse(readFileSync('fixtures/trips-flood.source.json', 'utf8')) as PlaySource
const fresh = () => createEditorState({ source: FIXTURE, look: COVER_2_LOOK })
const run = (s: EditorState, ...a: EditorAction[]) => a.reduce(editorReducer, s)
const X = { side: 'ours', slot: 'x' } as const

describe('route kinds', () => {
  it('stores a kind on drawn legs, leaving plain routes without one', () => {
    const s = run(
      fresh(),
      { type: 'addLeg', ref: X, to: { dx: 8, dy: 14 } },
      { type: 'addLeg', ref: X, to: { dx: 8, dy: 10 }, kind: 'motion' },
    )
    const legs = findPlayer(s, X)?.legs ?? []
    expect(legs.map((l) => l.kind)).toEqual([undefined, 'motion'])
    expect(PlaySourceSchema.safeParse(s.source).success).toBe(true)
  })

  it('setRouteKind rewrites every leg as one undo step, and route clears it', () => {
    const drawn = run(
      fresh(),
      { type: 'addLeg', ref: X, to: { dx: 5, dy: 14 } },
      { type: 'addLeg', ref: X, to: { dx: 9, dy: 12 } },
    )
    const block = run(drawn, { type: 'setRouteKind', ref: X, kind: 'block' })
    expect(findPlayer(block, X)?.legs.map((l) => l.kind)).toEqual(['block', 'block'])
    expect(block.past.length).toBe(drawn.past.length + 1)
    const back = run(block, { type: 'setRouteKind', ref: X, kind: 'route' })
    expect(findPlayer(back, X)?.legs.every((l) => !('kind' in l))).toBe(true)
    expect(run(back, { type: 'setRouteKind', ref: X, kind: 'route' })).toBe(back)
  })

  it('addPlayer picks a free slot, selects it and stops at 11; removePlayer undoes it', () => {
    const base = fresh()
    expect(base.source.players.length).toBe(MAX_PLAYERS)
    expect(run(base, { type: 'addPlayer', position: 'WR', at: { dx: 0, dy: 5 } })).toBe(base)
    const fewer = run(base, { type: 'removePlayer', ref: X })
    expect(fewer.source.players.length).toBe(10)
    const again = run(fewer, { type: 'addPlayer', position: 'WR', at: { dx: -1, dy: 14.2 } })
    expect(again.selection).toEqual({ side: 'ours', slot: 'x' })
    expect(findPlayer(again, X)?.align).toEqual({ dx: -1, dy: 14 })
    expect(run(base, { type: 'removePlayer', ref: { side: 'theirs', slot: 'cb_weak' } })).toBe(base)
  })

  it('clearRoute empties a route', () => {
    const s = run(fresh(), { type: 'addLeg', ref: X, to: { dx: 5, dy: 14 } })
    expect(findPlayer(run(s, { type: 'clearRoute', ref: X }), X)?.legs).toEqual([])
  })
})

describe('colours', () => {
  it('keeps a slot the same colour across positions and makes the QB line black', () => {
    expect(playerColor('z', 'WR')).toBe(playerColor('z', 'TE'))
    expect(playerColor('z', 'WR')).not.toBe(playerColor('x', 'WR'))
    expect(routeColor('qb', 'QB')).toBe('#0b0b0b')
    expect(playerColor('lt', 'LT')).toBe(playerColor('rg', 'RG'))
  })
})

describe('canvas drawing', () => {
  const render = (source: PlaySource) =>
    renderToStaticMarkup(
      createElement(EditorCanvas, {
        state: { source, look: COVER_2_LOOK, selection: null },
        width: 480,
        height: 640,
      }),
    )

  it('draws a cap per line type and a block cap on every lineman', () => {
    const withKind = (kind: PlaySource['players'][number]['legs'][number]['kind']) => ({
      ...FIXTURE,
      players: FIXTURE.players.map((p) =>
        p.slot === 'h' ? { ...p, legs: p.legs.map((l) => ({ ...l, kind })) } : p,
      ),
    })
    expect(render(withKind('route'))).toContain('data-cap="arrow"')
    expect(render(withKind('block'))).toContain('data-cap="block"')
    expect(render(withKind('motion'))).toContain('data-leg-kind="motion"')
    const path = render(withKind('path'))
    expect(path).not.toContain('data-cap=')
    expect(path.split('data-block-cap').length - 1).toBe(5)
  })

  it('renders a static thumbnail with no interaction and offense only', () => {
    const html = renderToStaticMarkup(
      createElement(PlayThumbnail, { source: FIXTURE, look: COVER_2_LOOK }),
    )
    expect(html).toContain('editor-canvas-compact')
    expect(html.split('data-player="ours:').length - 1).toBe(11)
    expect(html).not.toContain('data-player="theirs:')
    expect(html).not.toContain('data-waypoint')
  })
})

describe('script', () => {
  const play = (name: string): PlaySource => ({ ...FIXTURE, name })
  const script: Script = { plays: [play('a'), play('b'), play('c')], index: 1 }

  it('navigates within bounds and labels the position', () => {
    expect(positionLabel(script)).toBe('Play 2 of 3')
    expect(goTo(script, 99).index).toBe(2)
    expect(goTo(script, -5).index).toBe(0)
  })

  it('inserts after the current play, removes, and moves while following the current play', () => {
    const added = insertAfter(script, play('n'))
    expect(added.plays.map((p) => p.name)).toEqual(['a', 'b', 'n', 'c'])
    expect(added.index).toBe(2)
    const removed = removeAt(added, 0)
    expect(removed.plays.map((p) => p.name)).toEqual(['b', 'n', 'c'])
    expect(removed.index).toBe(1)
    expect(removeAt({ plays: [play('only')], index: 0 }, 0).plays.length).toBe(1)
    const moved = move(script, 1, -1)
    expect(moved.plays.map((p) => p.name)).toEqual(['b', 'a', 'c'])
    expect(moved.index).toBe(0)
    expect(move(script, 0, -1)).toBe(script)
  })

  it('putCurrent writes the edited play back; blank and copy drop the id and routes', () => {
    expect(putCurrent(script, play('edited')).plays[1]?.name).toBe('edited')
    const blank = blankPlay({ ...FIXTURE, id: 'x' }, 'Next')
    expect(blank.id).toBeUndefined()
    expect(blank.players.every((p) => p.legs.length === 0)).toBe(true)
    expect(copyPlay({ ...FIXTURE, id: 'x' }).id).toBeUndefined()
  })
})
