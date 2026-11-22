import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MyDepthCard } from '../src/app/MyDepthCard'
import {
  canChangeNote,
  checkNoteBody,
  countText,
  formatNoteDate,
  LABEL_PRIVATE,
  LABEL_SHARED,
  NOTE_MAX,
  noteLabel,
  notesByPlayer,
  previewText,
  rankLabel,
  readNotesSeen,
  seenKey,
  SHARE_WARNING,
  spotLabel,
  summarizeNotes,
  unseenNotes,
  writeNotesSeen,
  type DepthNote,
  type MyDepthNote,
} from '../src/team/depthNotes'
import { NoteForm, NotesThread } from '../src/team/NotesThread'
import type { RosterPlayer } from '../src/team/roster'

function note(id: string, over: Partial<DepthNote> = {}): DepthNote {
  return {
    id,
    rosterPlayerId: 'p1',
    slot: null,
    body: `Note ${id}`,
    shared: false,
    sharedAt: null,
    createdBy: 'coach-a',
    authorName: 'Coach A',
    createdAt: '2026-11-10T15:00:00.000Z',
    updatedAt: '2026-11-10T15:00:00.000Z',
    ...over,
  }
}

const PLAYER: RosterPlayer = {
  id: 'p1',
  userId: 'u1',
  name: 'Sam Kowalski',
  jersey: 76,
  position: 'OL',
  altPositions: [],
  gradYear: 2027,
  heightIn: 76,
  weightLb: 280,
  notes: 'Private: knee check',
}

describe('depth note labels and sharing', () => {
  it('labels shared and staff-only notes differently', () => {
    expect(noteLabel({ shared: true })).toBe(LABEL_SHARED)
    expect(noteLabel({ shared: false })).toBe(LABEL_PRIVATE)
    expect(LABEL_SHARED).toBe('Shared with player')
    expect(LABEL_PRIVATE).toBe('Private (staff only)')
  })

  it('lets only the author or the head coach change a note', () => {
    const mine = note('a', { createdBy: 'coach-a' })
    expect(canChangeNote(mine, { userId: 'coach-a', headCoach: false })).toBe(true)
    expect(canChangeNote(mine, { userId: 'coach-b', headCoach: false })).toBe(false)
    expect(canChangeNote(mine, { userId: 'coach-b', headCoach: true })).toBe(true)
    expect(canChangeNote(note('b', { createdBy: null }), { userId: null, headCoach: false })).toBe(
      false,
    )
  })

  it('checks the body: trimmed, not blank, at most 1000 characters', () => {
    expect(checkNoteBody('  Hands inside.  ')).toEqual({ ok: true, body: 'Hands inside.' })
    expect(checkNoteBody('   ').ok).toBe(false)
    expect(checkNoteBody('x'.repeat(NOTE_MAX)).ok).toBe(true)
    const long = checkNoteBody('x'.repeat(NOTE_MAX + 1))
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.error).toContain('1001')
  })

  it('groups notes by player, oldest first, and summarizes them', () => {
    const notes = [
      note('late', { createdAt: '2026-11-12T10:00:00.000Z', shared: true, body: 'Latest one' }),
      note('early', { createdAt: '2026-11-01T10:00:00.000Z' }),
      note('other', { rosterPlayerId: 'p2' }),
    ]
    const grouped = notesByPlayer(notes)
    expect(grouped.get('p1')?.map((row) => row.id)).toEqual(['early', 'late'])
    expect(grouped.get('p2')?.length).toBe(1)
    const summary = summarizeNotes(grouped.get('p1'))
    expect(summary).toMatchObject({ count: 2, shared: 1, private: 1 })
    expect(summary.last?.id).toBe('late')
    expect(summarizeNotes(undefined)).toEqual({ count: 0, shared: 0, private: 0, last: null })
    expect(countText(0)).toBe('No notes')
    expect(countText(1)).toBe('1 note')
    expect(countText(3)).toBe('3 notes')
  })

  it('previews one line, cut at a word', () => {
    expect(previewText('Short\nnote')).toBe('Short note')
    const cut = previewText(
      'Needs to be faster off the ball and keep his pad level low all game',
      30,
    )
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(30)
    expect(cut).toBe('Needs to be faster off the…')
  })

  it('formats dates and depth spots for people', () => {
    const now = new Date(2026, 10, 21, 18, 0)
    expect(formatNoteDate(new Date(2026, 10, 21, 9, 0).toISOString(), now)).toBe('Today')
    expect(formatNoteDate(new Date(2026, 10, 20, 9, 0).toISOString(), now)).toBe('Yesterday')
    expect(formatNoteDate(new Date(2026, 10, 3, 9, 0).toISOString(), now)).toBe('Nov 3')
    expect(formatNoteDate(new Date(2025, 8, 3, 9, 0).toISOString(), now)).toBe('Sep 3, 2025')
    expect(rankLabel(1)).toBe('Starter')
    expect(rankLabel(2)).toBe('2nd string')
    expect(rankLabel(3)).toBe('3rd string')
    expect(rankLabel(4)).toBe('4th string')
    expect(spotLabel({ slot: 'LT', rank: 2 })).toBe('LT, 2nd string')
    expect(spotLabel({ slot: 'KO_K', rank: 1 })).toBe('Kickoff K, Starter')
  })
})

describe('"new" indicator for the player', () => {
  const shared = (id: string, sharedAt: string): MyDepthNote => ({
    id,
    slot: null,
    body: id,
    authorName: 'Coach',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: sharedAt,
    sharedAt,
  })

  it('counts notes shared since the last visit, all of them on a first visit', () => {
    const notes = [
      shared('old', '2026-11-05T00:00:00.000Z'),
      shared('new', '2026-11-12T00:00:00.000Z'),
    ]
    expect(unseenNotes(notes, null).map((row) => row.id)).toEqual(['old', 'new'])
    expect(unseenNotes(notes, '2026-11-10T00:00:00.000Z').map((row) => row.id)).toEqual(['new'])
    expect(unseenNotes(notes, '2026-11-20T00:00:00.000Z')).toEqual([])
    expect(unseenNotes(notes, 'garbage').length).toBe(2)
  })

  it('stores the last visit per team and player, and survives broken storage', () => {
    const map = new Map<string, string>()
    const store = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    }
    expect(readNotesSeen('t1', 'u1', store)).toBeNull()
    writeNotesSeen('t1', 'u1', new Date('2026-11-21T12:00:00.000Z'), store)
    expect(readNotesSeen('t1', 'u1', store)).toBe('2026-11-21T12:00:00.000Z')
    expect(readNotesSeen('t1', 'u2', store)).toBeNull()
    expect(map.has(seenKey('t1', 'u1'))).toBe(true)

    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readNotesSeen('t1', 'u1', broken)).toBeNull()
    expect(() => writeNotesSeen('t1', 'u1', new Date(), broken)).not.toThrow()
    expect(readNotesSeen('t1', 'u1', null)).toBeNull()
  })

  it('renders the My depth chart card with spots, notes and the new marker', () => {
    const html = renderToStaticMarkup(
      createElement(MyDepthCard, {
        teamId: 't1',
        userId: 'u1',
        now: new Date(2026, 10, 21, 18, 0),
        initialSeenAt: '2026-11-10T00:00:00.000Z',
        initial: {
          spots: [{ slot: 'LT', rank: 2, depth: 3 }],
          notes: [
            shared('Keep your hands inside.', '2026-11-05T00:00:00.000Z'),
            shared('Faster off the ball.', '2026-11-12T00:00:00.000Z'),
          ],
        },
      }),
    )
    expect(html).toContain('My depth chart')
    expect(html).toContain('LT, 2nd string')
    expect(html).toContain('of 3')
    expect(html).toContain('1 new note')
    expect(html).toContain('Faster off the ball.')
    expect(html).toContain('Keep your hands inside.')
    expect(html.indexOf('Faster off the ball.')).toBeLessThan(
      html.indexOf('Keep your hands inside.'),
    )
  })

  it('has no marker when everything was seen, and says when the player has no spot', () => {
    const html = renderToStaticMarkup(
      createElement(MyDepthCard, {
        teamId: 't1',
        userId: 'u1',
        initialSeenAt: '2026-11-30T00:00:00.000Z',
        initial: { spots: [], notes: [shared('Seen', '2026-11-05T00:00:00.000Z')] },
      }),
    )
    expect(html).not.toContain('data-testid="my-depth-new"')
    expect(html).toContain('not on the depth chart yet')
  })
})

describe('coach notes thread', () => {
  const api = {
    me: { userId: 'coach-a', headCoach: false },
    add: () => Promise.resolve(),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  }

  it('shows both kinds of note with labels, and edit controls only on your own', () => {
    const html = renderToStaticMarkup(
      createElement(NotesThread, {
        player: PLAYER,
        api,
        notes: [
          note('a', { shared: true, body: 'Shared one', createdBy: 'coach-a' }),
          note('b', { shared: false, body: 'Internal one', createdBy: 'coach-b' }),
        ],
      }),
    )
    expect(html).toContain('Shared one')
    expect(html).toContain('Internal one')
    expect(html).toContain(LABEL_SHARED)
    expect(html).toContain(LABEL_PRIVATE)
    expect(html.split('>Edit<').length - 1).toBe(1)
    // The roster sheet's private staff note never leaks into the thread.
    expect(html).not.toContain('knee check')
  })

  it('warns that the player can read a note only when sharing is on', () => {
    const on = renderToStaticMarkup(
      createElement(NoteForm, {
        initial: { body: '', slot: 'LT', shared: true },
        slot: 'LT',
        submitLabel: 'Add note',
        busy: false,
        onSave: () => Promise.resolve(true),
      }),
    )
    expect(on).toContain(SHARE_WARNING)
    const off = renderToStaticMarkup(
      createElement(NoteForm, {
        initial: { body: '', slot: null, shared: false },
        slot: null,
        submitLabel: 'Add note',
        busy: false,
        onSave: () => Promise.resolve(true),
      }),
    )
    expect(off).not.toContain(SHARE_WARNING)
    expect(off).toContain('maxLength="1000"')
  })
})
