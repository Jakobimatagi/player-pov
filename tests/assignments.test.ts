import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  assignedSummary,
  assigneeLabel,
  dueFromDate,
  POSITION_GROUPS,
  type Assignment,
} from '../src/data/assignments'
import type { TeamPlayer } from '../src/data/slots'
import { AssignPanel } from '../src/playbook/AssignPanel'
import { PlaybookPage } from '../src/playbook/PlaybookPage'

const players: TeamPlayer[] = [
  { userId: 'u1', name: 'Jordan Reyes', position: 'QB' },
  { userId: 'u2', name: 'Marcus Hill', position: 'FS' },
  { userId: 'u3', name: 'Andre Cole', position: 'WR' },
]

const row = (over: Partial<Assignment>): Assignment => ({
  id: 'a',
  playbookId: 'f',
  group: null,
  userId: null,
  dueAt: null,
  ...over,
})

describe('assignment helpers', () => {
  it('names groups and players', () => {
    expect(assigneeLabel(row({ group: 'DB' }), players)).toBe('Defensive backs')
    expect(assigneeLabel(row({ userId: 'u2' }), players)).toBe('Marcus Hill')
    expect(assigneeLabel(row({ userId: 'gone' }), players)).toBe('A player')
    expect(POSITION_GROUPS.map((g) => g.id)).toEqual([
      'QB',
      'RB',
      'WR',
      'TE',
      'OL',
      'DL',
      'LB',
      'DB',
      'ST',
    ])
  })

  it('summarizes a folder’s assignments for its row', () => {
    expect(assignedSummary([row({ group: 'DB' }), row({ group: 'LB' })], players)).toBe('DB, LB')
    expect(assignedSummary([row({ group: 'DB' }), row({ userId: 'u1' })], players)).toBe(
      'DB, Jordan Reyes',
    )
    expect(assignedSummary([row({ userId: 'u1' }), row({ userId: 'u2' })], players)).toBe(
      '2 players',
    )
  })

  it('stores a due date as the end of that local day', () => {
    const due = new Date(dueFromDate('2026-11-27')!)
    expect([due.getFullYear(), due.getMonth(), due.getDate(), due.getHours()]).toEqual([
      2026, 10, 27, 23,
    ])
    expect(dueFromDate('next friday')).toBeNull()
  })
})

function panel(over: Partial<Parameters<typeof AssignPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(AssignPanel, {
      folderName: 'Base 4-3',
      side: 'defense',
      own: [],
      inherited: [],
      players,
      playCount: 3,
      draftCount: 2,
      canEdit: true,
      onAssign: async () => {},
      onRemove: async () => {},
      onClose: () => {},
      ...over,
    }),
  )
}

describe('assign panel', () => {
  it('warns which plays players will not see yet, and suggests the side’s groups first', () => {
    const html = panel()
    expect(html).toContain('Assign Base 4-3')
    expect(html).toContain('2 of 3 plays are drafts and stay hidden until published.')
    expect(html).toContain('Not assigned to anyone yet.')
    const options = [...html.matchAll(/<option value="([A-Z]{2})"/g)].map((m) => m[1])
    expect(options.slice(0, 3)).toEqual(['DL', 'LB', 'DB'])
  })

  it('lists current and inherited assignments, with Remove only on its own', () => {
    const html = panel({
      draftCount: 0,
      own: [row({ id: 'x', group: 'DB', dueAt: '2026-11-27T23:59:59.000Z' })],
      inherited: [{ ...row({ id: 'y', userId: 'u2' }), from: 'Our Playbooks' }],
    })
    expect(html).toContain('All 3 plays are published.')
    expect(html).toContain('Defensive backs')
    expect(html).toMatch(/Due [A-Z][a-z]{2}, Nov 2[78]/)
    expect(html).toContain('Through Our Playbooks')
    expect(html.match(/>Remove</g)).toHaveLength(1)
  })

  it('is read-only for a coach who does not own the book’s side', () => {
    const html = panel({ canEdit: false, own: [row({ group: 'DB' })] })
    expect(html).not.toContain('>Remove<')
    expect(html).not.toContain('<select')
    expect(html).toContain('Only the head coach or this book’s coordinator')
  })
})

describe('playbook page (no backend)', () => {
  it('shows staff who each folder is assigned to, with an Assign action', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/playbook?folder=ours'] },
        createElement(PlaybookPage),
      ),
    )
    expect(html).toContain('Assigned: QB')
    expect(html).toContain('>Assign<')
  })

  it('shows players no assignment controls', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/playbook?roster=player'] },
        createElement(PlaybookPage),
      ),
    )
    expect(html).not.toContain('>Assign<')
    expect(html).not.toContain('Assigned:')
  })
})
