import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditorCanvas } from '../src/editor/EditorCanvas'
import { createEditorState, type EditorState } from '../src/editor/state'
import { COVER_2_LOOK } from '../src/play/cover2Look'
import type { PlaySource } from '../src/play/sourceTypes'

const FIXTURE = JSON.parse(readFileSync('fixtures/trips-flood.source.json', 'utf8')) as PlaySource

function render(state: EditorState, rotate: 0 | 90 = 90): string {
  return renderToStaticMarkup(
    createElement(EditorCanvas, { state, width: 480, height: 640, rotate }),
  )
}

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('EditorCanvas', () => {
  const base = createEditorState({ source: FIXTURE, look: COVER_2_LOOK })

  it('renders all 22 players and the one route of Trips Flood vs Cover 2', () => {
    const html = render(base)
    expect(count(html, 'data-player="ours:')).toBe(11)
    expect(count(html, 'data-player="theirs:')).toBe(11)
    expect(count(html, 'data-route=')).toBe(1)
    expect(html).toContain('data-route="ours:h"')
    expect(html).toContain('aria-label="Play chart: Trips Right Flood"')
    expect(html).toContain('touch-action:none')
    expect(html).not.toContain('data-selected')
  })

  it('matches the fixture snapshot', () => {
    expect(render(base)).toMatchSnapshot()
  })

  it('marks the selected player and shows its waypoints', () => {
    const html = render({ ...base, selection: { side: 'ours', slot: 'h', leg: 1 } })
    expect(count(html, 'data-selected="true"')).toBe(1)
    expect(html).toMatch(/data-player="ours:h" data-selected="true"/)
    expect(count(html, 'data-waypoint=')).toBe(
      FIXTURE.players.find((p) => p.slot === 'h')?.legs.length,
    )
    expect(html).toContain('Offense WR #11 (h), selected')
  })

  it('renders horizontal too', () => {
    const html = render(base, 0)
    expect(count(html, 'data-player=')).toBe(22)
  })
})
