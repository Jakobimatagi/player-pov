import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { DEMO_DEPTH, DEMO_ROSTER } from '../src/team/demoRoster'
import { DEPTH_SLOTS, slotSide, slotsFor } from '../src/team/depthSlots'
import { DepthChartPage } from '../src/team/DepthChartPage'
import {
  depthCandidates,
  formatHeight,
  matchesFilter,
  moveInList,
  parseHeight,
  parsePositions,
  parseRosterPaste,
  parseWhole,
  slotsByPlayer,
  sortRoster,
  type RosterPlayer,
} from '../src/team/roster'
import { RosterSheetPage } from '../src/team/RosterSheetPage'

function player(patch: Partial<RosterPlayer>): RosterPlayer {
  return {
    id: 'p',
    userId: null,
    name: 'Player',
    jersey: null,
    position: null,
    altPositions: [],
    gradYear: null,
    heightIn: null,
    weightLb: null,
    notes: '',
    ...patch,
  }
}

describe('roster parsing', () => {
  it('reads heights the way coaches type them', () => {
    expect(parseHeight(`5'11"`)).toBe(71)
    expect(parseHeight('5-11')).toBe(71)
    expect(parseHeight('6 2')).toBe(74)
    expect(parseHeight('511')).toBe(71)
    expect(parseHeight('600')).toBe(72)
    expect(parseHeight('72')).toBe(72)
    expect(parseHeight(`6'`)).toBe(72)
    expect(parseHeight('')).toBeNull()
    expect(parseHeight('5-13')).toBe('invalid')
    expect(parseHeight('tall')).toBe('invalid')
    expect(parseHeight('30')).toBe('invalid')
    expect(formatHeight(71)).toBe(`5'11"`)
    expect(formatHeight(null)).toBe('')
  })

  it('reads numbers in range and positions in any case', () => {
    expect(parseWhole('#12', 0, 99)).toBe(12)
    expect(parseWhole('100', 0, 99)).toBe('invalid')
    expect(parseWhole(' ', 0, 99)).toBeNull()
    expect(parsePositions('lb, s / ath, xx, LB')).toEqual(['LB', 'S', 'ATH'])
    expect(parsePositions('DB')).toEqual(['CB'])
  })

  it('imports pasted spreadsheet rows and reports bad cells', () => {
    const text = [
      'Number\tName\tPos\tYear\tHt\tWt',
      '12\tMarcus Hill\tQB\t2027\t6-2\t190 lbs',
      '\tWalk On\tLB, RB',
      '150\tBig Number\tOL\t2027\tseven\t',
      '5\t\tWR',
    ].join('\n')
    const { players, problems } = parseRosterPaste(text)
    expect(players).toHaveLength(3)
    expect(players[0]).toEqual({
      name: 'Marcus Hill',
      jersey: 12,
      position: 'QB',
      altPositions: [],
      gradYear: 2027,
      heightIn: 74,
      weightLb: 190,
    })
    expect(players[1]).toMatchObject({
      name: 'Walk On',
      jersey: null,
      position: 'LB',
      altPositions: ['RB'],
    })
    expect(players[2]).toMatchObject({ jersey: null, heightIn: null })
    expect(problems).toEqual([
      'Row 4: jersey "150" ignored',
      'Row 4: height "seven" ignored',
      'Row 5: no name, skipped',
    ])
  })

  it('accepts comma-separated rows too', () => {
    expect(parseRosterPaste('3, Jordan Bell, S CB, 2027').players[0]).toMatchObject({
      jersey: 3,
      position: 'S',
      altPositions: ['CB'],
      gradYear: 2027,
    })
  })
})

describe('roster lists', () => {
  const roster = [
    player({ id: 'a', name: 'Zed', jersey: 9, position: 'S', gradYear: 2028 }),
    player({
      id: 'b',
      name: 'Abe',
      jersey: 2,
      position: 'QB',
      altPositions: ['S'],
      gradYear: 2027,
    }),
    player({ id: 'c', name: 'Moe', jersey: null, position: null }),
    player({ id: 'd', name: 'Kip', jersey: 5, position: 'K' }),
  ]

  it('sorts by number, name, position and year', () => {
    expect(sortRoster(roster, 'jersey').map((p) => p.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(sortRoster(roster, 'name').map((p) => p.id)).toEqual(['b', 'd', 'c', 'a'])
    expect(sortRoster(roster, 'position').map((p) => p.id)).toEqual(['b', 'a', 'd', 'c'])
    expect(sortRoster(roster, 'gradYear').map((p) => p.id)).toEqual(['b', 'a', 'd', 'c'])
  })

  it('filters by side using primary and other positions', () => {
    const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
      roster.filter((p) => matchesFilter(p, filter)).map((p) => p.id)
    expect(ids('offense')).toEqual(['b'])
    expect(ids('defense')).toEqual(['a', 'b'])
    expect(ids('special')).toEqual(['d'])
    expect(ids('unassigned')).toEqual(['c'])
  })

  it('suggests players who fit the slot first and leaves out those already there', () => {
    const fs = DEPTH_SLOTS.find((slot) => slot.id === 'FS')
    if (fs == null) throw new Error('no FS slot')
    const { suggested, others } = depthCandidates(fs, roster, ['a'])
    expect(suggested.map((p) => p.id)).toEqual(['b'])
    expect(others.map((p) => p.id)).toEqual(['d', 'c'])
  })

  it('moves depth entries and lists where each player plays', () => {
    expect(moveInList(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveInList(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(slotsByPlayer({ QB: ['b', 'a'], KR: ['a'] }).get('a')).toEqual(['QB (2)', 'KR'])
  })
})

describe('depth slots', () => {
  it('matches the database slot list and sides', () => {
    const sql = readFileSync(
      new URL('../supabase/migrations/20261123000000_special_teams.sql', import.meta.url),
      'utf8',
    )
    for (const slot of DEPTH_SLOTS) expect(sql).toContain(`'${slot.id}'`)
    expect(slotsFor('offense')).toHaveLength(11)
    expect(slotsFor('defense')).toHaveLength(11)
    expect(slotSide('FS')).toBe('defense')
    expect(slotSide('LT')).toBe('offense')
    expect(slotSide('KR_R1')).toBe('special')
    expect(slotSide('KR')).toBeNull()
    for (const u of ['ko', 'kr', 'punt', 'pr', 'fg', 'pat'] as const)
      expect(slotsFor(u)).toHaveLength(11)
    expect(new Set(DEPTH_SLOTS.map((slot) => slot.id)).size).toBe(DEPTH_SLOTS.length)
  })

  it('demo depth only points at demo players', () => {
    const ids = new Set(DEMO_ROSTER.map((p) => p.id))
    for (const list of Object.values(DEMO_DEPTH))
      for (const id of list) expect(ids.has(id)).toBe(true)
  })
})

describe('pages (no backend)', () => {
  const render = (page: () => React.ReactElement) =>
    renderToStaticMarkup(createElement(MemoryRouter, null, createElement(page)))

  it('draws the offense depth chart as position cards', () => {
    const html = render(DepthChartPage)
    expect(html).toContain('Depth chart')
    expect(html).toContain('data-testid="depth-LT"')
    expect(html).toContain('Left tackle (LT): #76 Sam Kowalski')
    expect(html).toContain('Quarterback (QB): #12 Marcus Hill, 2 deep')
    expect(html).not.toContain('data-testid="depth-FS"')
  })

  it('renders the roster sheet with editable cells and staff-only notes', () => {
    const html = render(RosterSheetPage)
    expect(html).toContain('aria-label="Roster"')
    expect(html).toContain('25 players')
    expect(html).toContain('aria-label="Height for Marcus Hill"')
    expect(html).toContain('Staff notes are never shown to players')
    expect(html).toContain('+ Add player')
  })
})
