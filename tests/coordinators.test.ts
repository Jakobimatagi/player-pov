import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { canEditSide, staffTitle } from '../src/auth/sides'
import { cameraState } from '../src/camera/cameraState'
import { EMPTY_RULE, isEmptyRule, ruleColumns, type PositionRule } from '../src/data/rules'
import type { CompiledPlay } from '../src/play/types'
import { NewFolderForm } from '../src/playbook/FolderForms'
import { effectiveSide, matchesSide, type Folder } from '../src/playbook/folders'
import { RuleCard } from '../src/viewer/RuleCard'
import { RulesPanel } from '../src/viewer/RulesPanel'

describe('side permissions (mirror of app.can_edit_side)', () => {
  it('lets the head coach edit both sides', () => {
    expect(canEditSide('head_coach', 'offense', 'defense')).toBe(true)
    expect(canEditSide('head_coach', null, 'offense')).toBe(true)
  })

  it('keeps each coordinator on their own side', () => {
    expect(canEditSide('coach', 'offense', 'offense')).toBe(true)
    expect(canEditSide('coach', 'offense', 'defense')).toBe(false)
    expect(canEditSide('coach', 'defense', 'offense')).toBe(false)
    expect(canEditSide('coach', 'defense', null)).toBe(true)
  })

  it('leaves a coach with no side editing both, and players nothing', () => {
    expect(canEditSide('coach', null, 'defense')).toBe(true)
    expect(canEditSide('player', null, null)).toBe(false)
    expect(canEditSide(null, null, null)).toBe(false)
  })

  it('titles coordinators on the roster', () => {
    expect(staffTitle('coach', 'offense')).toBe('Offensive coordinator')
    expect(staffTitle('coach', 'defense')).toBe('Defensive coordinator')
    expect(staffTitle('coach', null)).toBe('Coach')
    expect(staffTitle('head_coach', 'offense')).toBe('Head coach · OC')
    expect(staffTitle('player', null)).toBe('Player')
  })
})

describe('folder sides', () => {
  const tree: Folder[] = [
    {
      id: 'o',
      name: 'Offense',
      parentId: null,
      kind: 'playbook',
      archived: false,
      side: 'offense',
    },
    { id: 'o1', name: 'Red zone', parentId: 'o', kind: 'playbook', archived: false },
    {
      id: 'd',
      name: 'Defense',
      parentId: null,
      kind: 'playbook',
      archived: false,
      side: 'defense',
    },
    { id: 's', name: 'Special teams', parentId: null, kind: 'playbook', archived: false },
  ]

  it('inherits the nearest side above', () => {
    expect(effectiveSide(tree, 'o1')).toBe('offense')
    expect(effectiveSide(tree, 'd')).toBe('defense')
    expect(effectiveSide(tree, 's')).toBeNull()
    expect(effectiveSide(tree, null)).toBeNull()
  })

  it('filters top-level books by side and keeps shared ones', () => {
    const shown = (filter: 'all' | 'offense' | 'defense') =>
      tree.filter((f) => f.parentId == null && matchesSide(tree, f, filter)).map((f) => f.id)
    expect(shown('all')).toEqual(['o', 'd', 's'])
    expect(shown('offense')).toEqual(['o', 's'])
    expect(shown('defense')).toEqual(['d', 's'])
  })

  it('offers a side choice when creating a top-level book', () => {
    const html = renderToStaticMarkup(
      createElement(NewFolderForm, {
        parentName: null,
        initialKind: 'playbook',
        sides: ['defense', null],
        initialSide: 'defense',
        onCreate: async () => {},
        onCancel: () => {},
      }),
    )
    expect(html).toContain('Side of the ball')
    expect(html).toContain('Defense')
    expect(html).toContain('Shared')
    expect(html).not.toContain('Offense')
  })
})

describe('position rules', () => {
  it('treats an all-blank rule as empty and stores blanks as null', () => {
    expect(isEmptyRule({ ...EMPTY_RULE, alignment: ' ', notes: '\n' })).toBe(true)
    expect(isEmptyRule({ ...EMPTY_RULE, assignment: 'Deep half' })).toBe(false)
    expect(
      ruleColumns({ ...EMPTY_RULE, alignment: ' 12 yds ', keyRead: '#2', react: ' Carry him ' }),
    ).toEqual({
      alignment: '12 yds',
      assignment: null,
      adjustment: null,
      key_read: '#2',
      recognize: null,
      react: 'Carry him',
      notes: null,
    })
  })

  const play = {
    ids: ['qb', 'fs'],
    positions: ['QB', 'S'],
    jerseys: [7, 21],
  } as unknown as CompiledPlay
  const rules: PositionRule[] = [
    {
      slot: 'fs',
      side: 'defense',
      alignment: '12 yards, split the hashes',
      assignment: 'Deep half',
      adjustment: '',
      keyRead: '#2 vertical',
      recognize: '',
      react: '',
      notes: '',
      updatedAt: '2026-11-21T00:00:00Z',
    },
  ]

  function card(attached: number, locked: boolean): string {
    cameraState.attached = attached
    return renderToStaticMarkup(createElement(RuleCard, { play, rules, locked }))
  }

  it("shows the followed player's rules", () => {
    const html = card(1, true)
    expect(html).toContain('Your job: FS #21')
    expect(html).toContain('Deep half')
    expect(html).toContain('Read')
    expect(html).toContain('Pre-snap')
    expect(html).not.toContain('Coaching points')
  })

  it('applies a vs exception for the formation the play was charted against', () => {
    cameraState.attached = 1
    const html = renderToStaticMarkup(
      createElement(RuleCard, {
        play,
        rules,
        locked: true,
        facing: {
          id: 'lib:gun-trips-rt',
          name: 'Gun Trips Right',
          tags: { personnel: '11', structure: '3x1', backfield: 'gun', strength: 'right' },
        },
        variants: [
          {
            ...rules[0]!,
            alignment: 'Over #3 at 10',
            assignment: '',
            keyRead: '',
            scope: 'structure',
            match: '3x1',
          },
        ],
      }),
    )
    expect(html).toContain('Over #3 at 10')
    expect(html).toMatch(/class="rule-vs">vs (<!-- -->)?3x1</)
    expect(html).toContain('Deep half')
    expect(html).not.toContain('12 yards, split the hashes')
  })

  it('tells a locked player when there are no rules, and stays hidden otherwise', () => {
    expect(card(0, true)).toContain('hasn&#x27;t written rules')
    expect(card(0, false)).toBe('')
    expect(card(-1, false)).toBe('')
  })

  it('shows a coordinator the other side as view only, own side first', () => {
    const full = {
      ...play,
      hopOrder: { offense: new Uint8Array([0]), defense: new Uint8Array([1]) },
    } as unknown as CompiledPlay
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(RulesPanel, {
          play: full,
          playId: 'p',
          teamId: 't',
          role: 'coach',
          mySide: 'defense',
          rules,
          onSaved: () => {},
          open: true,
          setOpen: () => {},
        }),
      ),
    )
    expect(html).toContain('href="/plays/p"')
    expect(html).toContain('As defensive coordinator you edit defense players.')
    expect(html.indexOf('<h3>Defense</h3>')).toBeGreaterThan(-1)
    expect(html).toContain('Offense · view only')
    expect(html.indexOf('Defense</h3>')).toBeLessThan(html.indexOf('Offense · view only'))
    expect(html).toContain('Deep half')
  })
})
