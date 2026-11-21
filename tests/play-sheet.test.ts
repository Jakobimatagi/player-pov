import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_RULE,
  isCompleteRule,
  missingFields,
  playCompletion,
  REQUIRED_FIELDS,
  RULE_FIELDS,
} from '../src/data/rules'
import { FIELD_WIDTH } from '../src/play/coords'
import { boardLayout, boardMark, boardOrder, BOARD_MARGIN } from '../src/playsheet/board'
import { demoPlay } from '../src/playsheet/demo'
import { PlaySheetPage } from '../src/playsheet/PlaySheetPage'
import { RuleView } from '../src/playsheet/RuleEditor'

const full = {
  ...EMPTY_RULE,
  alignment: 'a',
  assignment: 'b',
  adjustment: 'c',
  keyRead: 'd',
  recognize: 'e',
  react: 'f',
}

describe('the 3 A’s and 3 R’s', () => {
  it('requires alignment, assignment, adjustment, read, recognize and react', () => {
    expect(REQUIRED_FIELDS.map((field) => field.label)).toEqual([
      'Alignment',
      'Assignment',
      'Adjustment',
      'Read',
      'Recognize',
      'React',
    ])
    expect(RULE_FIELDS.filter((field) => field.phase === 'pre').map((f) => f.key)).toEqual([
      'alignment',
      'assignment',
      'adjustment',
    ])
    expect(RULE_FIELDS.filter((field) => field.phase === 'post').map((f) => f.key)).toEqual([
      'keyRead',
      'recognize',
      'react',
    ])
    expect(RULE_FIELDS.find((field) => field.key === 'notes')?.required).toBe(false)
  })

  it('counts blanks and whitespace as missing, and coaching points as optional', () => {
    expect(isCompleteRule(full)).toBe(true)
    expect(isCompleteRule({ ...full, notes: '' })).toBe(true)
    expect(missingFields({ ...full, react: '   ', adjustment: '' }).map((f) => f.key)).toEqual([
      'adjustment',
      'react',
    ])
    expect(missingFields(undefined)).toHaveLength(6)
  })

  it('reports which of our positions are done, like app.play_rule_gaps', () => {
    const result = playCompletion(
      ['qb', 'x', 'rb'],
      [
        { slot: 'qb', ...full },
        { slot: 'x', ...full, recognize: '' },
        { slot: 'fs', ...EMPTY_RULE },
      ],
    )
    expect(result).toEqual({ total: 3, complete: ['qb'], incomplete: ['x', 'rb'] })
  })
})

describe('play board', () => {
  const play = demoPlay()
  const layout = boardLayout(play, 'offense')

  it('draws all 22 players and flags our 11', () => {
    expect(layout.players).toHaveLength(22)
    expect(layout.players.filter((player) => player.ours)).toHaveLength(11)
    expect(layout.players.filter((player) => player.ours).every((p) => p.team === 'offense')).toBe(
      true,
    )
    expect(boardLayout(play, 'defense').players.filter((p) => p.ours)[0]?.team).toBe('defense')
  })

  it('puts the offense moving up, with its right sideline on the right', () => {
    const qb = layout.players.find((player) => player.id === 'qb')
    const fs = layout.players.find((player) => player.id === 'fs')
    expect(qb).toBeDefined()
    expect(fs).toBeDefined()
    // The QB is behind the line (below it), the deep safety is above it.
    expect(qb!.align.y).toBeGreaterThan(layout.los)
    expect(fs!.align.y).toBeLessThan(layout.los)
    // Every route that goes downfield ends higher on the board than it starts.
    const x = layout.players.find((player) => player.id === 'x')!
    expect(x.path[x.path.length - 1]!.y).toBeLessThan(x.align.y)
    expect(layout.sidelines[0]).toBe(BOARD_MARGIN)
    expect(layout.sidelines[1]).toBeCloseTo(BOARD_MARGIN + FIELD_WIDTH, 1)
    expect(layout.width).toBeCloseTo(FIELD_WIDTH + 2 * BOARD_MARGIN, 1)
  })

  it('keeps every player and route inside the board', () => {
    for (const player of layout.players) {
      for (const point of player.path) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(layout.width)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(layout.height)
      }
    }
  })

  it('lists ours first, left to right', () => {
    const ordered = boardOrder(layout.players)
    expect(ordered.slice(0, 11).every((player) => player.ours)).toBe(true)
    const xs = ordered.slice(0, 11).map((player) => player.align.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })

  it('marks chips the way coaches draw them', () => {
    expect(boardMark('qb', 'QB', 'offense')).toBe('QB')
    expect(boardMark('x', 'WR', 'offense')).toBe('X')
    expect(boardMark('mike', 'LB', 'defense')).toBe('M')
    expect(boardMark('fs', 'S', 'defense')).toBe('FS')
  })
})

function sheet(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/plays/:playId', element: createElement(PlaySheetPage) }),
      ),
    ),
  )
}

describe('play sheet (no backend)', () => {
  it('gives coaches the board, a completion meter and a gated publish button', () => {
    const html = sheet('/plays/flood')
    expect(html).toContain('data-testid="play-board"')
    expect(html).toContain('Draft')
    expect(html).toMatch(/4 of 11 positions have all 3 A’s and 3 R’s/)
    expect(html).toContain('Players can’t see this play yet')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="sheet-publish"/)
    expect(html).toContain('Pre-snap')
    expect(html).toContain('Post-snap')
    expect(html).toContain('Scout look · optional')
  })

  it('opens a player on their own position, read-only, with no draft or meter', () => {
    const html = sheet('/plays/flood?roster=player')
    expect(html).toContain('Your job: H')
    expect(html).toContain('Corner at 10')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('data-testid="sheet-meter"')
    expect(html).not.toContain('data-testid="sheet-publish"')
    expect(html).toContain('Watch in 3D')
  })

  it('lets a coach open any position from the URL', () => {
    const html = sheet('/plays/flood?pos=fs')
    expect(html).toContain('FS #')
    expect(html).toContain('scout look')
  })
})

describe('rule view', () => {
  it('flags missing answers on our side and skips blanks on the scout look', () => {
    const ours = renderToStaticMarkup(
      createElement(RuleView, { rule: { ...full, react: '' }, required: true }),
    )
    expect(ours).toContain('Not answered yet')
    const theirs = renderToStaticMarkup(
      createElement(RuleView, {
        rule: { ...EMPTY_RULE, assignment: 'Deep half' },
        required: false,
      }),
    )
    expect(theirs).toContain('Deep half')
    expect(theirs).not.toContain('Not answered yet')
    expect(theirs).not.toContain('Post-snap')
  })
})
