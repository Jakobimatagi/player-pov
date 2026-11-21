import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { canEditSide, staffTitle } from '../src/auth/sides'
import { cameraState } from '../src/camera/cameraState'
import { isEmptyRule, ruleColumns, type PositionRule } from '../src/data/rules'
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
    expect(isEmptyRule({ alignment: ' ', assignment: '', keyRead: '', notes: '\n' })).toBe(true)
    expect(isEmptyRule({ alignment: '', assignment: 'Deep half', keyRead: '', notes: '' })).toBe(
      false,
    )
    expect(
      ruleColumns({ alignment: ' 12 yds ', assignment: '', keyRead: '#2', notes: '' }),
    ).toEqual({ alignment: '12 yds', assignment: null, key_read: '#2', notes: null })
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
      keyRead: '#2 vertical',
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
    expect(html).toContain('Key / read')
    expect(html).not.toContain('Coaching points')
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
    )
    expect(html).toContain('As defensive coordinator you edit defense players.')
    expect(html.indexOf('<h3>Defense</h3>')).toBeGreaterThan(-1)
    expect(html).toContain('Offense · view only')
    expect(html.indexOf('Defense</h3>')).toBeLessThan(html.indexOf('Offense · view only'))
    expect(html).toContain('Deep half')
  })
})
