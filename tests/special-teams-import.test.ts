import { describe, expect, it } from 'vitest'
import { canEditSide, staffTitle } from '../src/auth/sides'
import { DEPTH_SLOTS, groupOf, slotSide, SPECIAL_UNITS, unitColumns } from '../src/team/depthSlots'
import {
  parseGradYear,
  parseRosterTable,
  seniorGradYear,
  splitDelimited,
  splitNewPlayers,
} from '../src/team/roster'

const FALL = new Date(2026, 9, 15) // October 2026: seniors are the class of 2027
const SPRING = new Date(2027, 2, 1) // March 2027: still the class of 2027

describe('special teams coordinator', () => {
  it('lets the special teams coordinator edit special teams only', () => {
    expect(canEditSide('coach', 'special', 'special')).toBe(true)
    expect(canEditSide('coach', 'special', 'offense')).toBe(false)
    expect(canEditSide('coach', 'special', 'defense')).toBe(false)
  })

  it('keeps special teams shared until a special teams coordinator is named', () => {
    expect(canEditSide('coach', 'offense', 'special', false)).toBe(true)
    expect(canEditSide('coach', 'offense', 'special', true)).toBe(false)
    expect(canEditSide('coach', 'defense', 'special')).toBe(false)
    expect(canEditSide('head_coach', null, 'special', true)).toBe(true)
    expect(canEditSide('coach', null, 'special', true)).toBe(true)
    expect(canEditSide('player', null, 'special', false)).toBe(false)
  })

  it('titles the special teams coordinator', () => {
    expect(staffTitle('coach', 'special')).toBe('Special teams coordinator')
    expect(staffTitle('head_coach', 'special')).toBe('Head coach · STC')
  })

  it('has six units of eleven with no two cards in the same spot', () => {
    expect(SPECIAL_UNITS).toEqual(['ko', 'kr', 'punt', 'pr', 'fg', 'pat'])
    for (const unit of SPECIAL_UNITS) {
      const slots = DEPTH_SLOTS.filter((slot) => slot.unit === unit)
      expect(slots).toHaveLength(11)
      const spots = new Set(slots.map((slot) => `${slot.col}:${slot.row}`))
      expect(spots.size).toBe(11)
      expect(Math.max(...slots.map((slot) => slot.col))).toBeLessThanOrEqual(unitColumns(unit))
      expect(groupOf(unit)).toBe('special')
    }
    expect(slotSide('PAT_K')).toBe('special')
    expect(slotSide('PNT_GL')).toBe('special')
  })

  it('also keeps offense and defense cards from overlapping', () => {
    for (const unit of ['offense', 'defense'] as const) {
      const slots = DEPTH_SLOTS.filter((slot) => slot.unit === unit)
      expect(new Set(slots.map((slot) => `${slot.col}:${slot.row}`)).size).toBe(slots.length)
    }
  })
})

describe('roster import', () => {
  it('splits quoted CSV cells', () => {
    expect(splitDelimited('12,"Hill, Jr.",QB', ',')).toEqual(['12', 'Hill, Jr.', 'QB'])
    expect(splitDelimited('"He said ""go""",x', ',')).toEqual(['He said "go"', 'x'])
  })

  it('turns class names into graduation years by season', () => {
    expect(seniorGradYear(FALL)).toBe(2027)
    expect(seniorGradYear(SPRING)).toBe(2027)
    expect(parseGradYear('Sr', FALL)).toBe(2027)
    expect(parseGradYear('Junior', FALL)).toBe(2028)
    expect(parseGradYear('So.', FALL)).toBe(2029)
    expect(parseGradYear('9', FALL)).toBe(2030)
    expect(parseGradYear("'28", FALL)).toBe(2028)
    expect(parseGradYear('2029', FALL)).toBe(2029)
    expect(parseGradYear('senior-ish', FALL)).toBe('invalid')
  })

  it('matches columns by header name and ignores the rest', () => {
    const csv = [
      '﻿First Name,Last Name,Jersey #,Position,Secondary Position,Class,Height,Weight,Parent Email',
      'Marcus,Hill,12,QB,,Jr,6-2,190,someone@example.com',
      '"Darnell","Smith, Jr.",21,CB,WR,Sr,"5\'10""",172 lbs,',
      ',,5,WR,,,,,',
    ].join('\r\n')
    const { players, problems, columns } = parseRosterTable(csv, FALL)
    expect(columns).toEqual(['name', 'jersey', 'position', 'alt', 'grad', 'height', 'weight'])
    expect(players).toEqual([
      {
        name: 'Marcus Hill',
        jersey: 12,
        position: 'QB',
        altPositions: [],
        gradYear: 2028,
        heightIn: 74,
        weightLb: 190,
      },
      {
        name: 'Darnell Smith, Jr.',
        jersey: 21,
        position: 'CB',
        altPositions: ['WR'],
        gradYear: 2027,
        heightIn: 70,
        weightLb: 172,
      },
    ])
    expect(problems).toEqual(['Row 4: no name, skipped'])
    expect(JSON.stringify(players)).not.toContain('example.com')
  })

  it('reads a single Name column with tabs and a different column order', () => {
    const tsv = 'Name\tPos\tNo.\tGrad Year\nNate Harris\tLB, RB\t52\t2027'
    expect(parseRosterTable(tsv, FALL).players[0]).toMatchObject({
      name: 'Nate Harris',
      jersey: 52,
      position: 'LB',
      altPositions: ['RB'],
      gradYear: 2027,
    })
  })

  it('falls back to the fixed column order without a header', () => {
    expect(parseRosterTable('44, Walk On, LB', FALL).players[0]).toMatchObject({
      name: 'Walk On',
      jersey: 44,
      position: 'LB',
    })
  })

  it('skips players already on the roster and duplicates in the file', () => {
    const { fresh, existing } = splitNewPlayers(
      [{ name: 'Marcus Hill' }, { name: 'marcus  hill' }, { name: 'New Kid' }, { name: 'New Kid' }],
      [{ name: 'Marcus Hill' }],
    )
    expect(fresh.map((p) => p.name)).toEqual(['New Kid'])
    expect(existing.map((p) => p.name)).toEqual(['Marcus Hill', 'marcus  hill', 'New Kid'])
  })

  it('reads a header with only one known column instead of guessing positions', () => {
    const { players, problems } = parseRosterTable('Name,Email\nMarcus Hill,mh@example.org', FALL)
    expect(players).toEqual([expect.objectContaining({ name: 'Marcus Hill', jersey: null })])
    expect(problems).toEqual([])
    expect(parseRosterTable('Name\nSolo Player', FALL).players[0]?.name).toBe('Solo Player')
  })

  it('compares names across scripts and accents without collapsing them', () => {
    const { fresh, existing } = splitNewPlayers(
      [
        { name: 'Иван Петров' },
        { name: 'Алексей Смирнов' },
        { name: 'Zoe Adams' },
        { name: '---' },
      ],
      [{ name: 'Zoë Adams' }, { name: '???' }],
    )
    expect(fresh.map((p) => p.name)).toEqual(['Иван Петров', 'Алексей Смирнов', '---'])
    expect(existing.map((p) => p.name)).toEqual(['Zoe Adams'])
  })
})
