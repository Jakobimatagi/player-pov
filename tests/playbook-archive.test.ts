import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  afterRestore,
  DEMO_ARCHIVED,
  DEMO_PLAYS,
  honorDemoRoster,
  listStatus,
  visiblePlays,
} from '../src/playbook/archive'
import { PlaybookPage } from '../src/playbook/PlaybookPage'

function page(path: string): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(PlaybookPage)),
  )
}

const mesh = DEMO_ARCHIVED[0]
if (mesh == null) throw new Error('missing archived demo play')

describe('archived plays', () => {
  it('lets staff see an archived play and puts a restored play back on the active list', () => {
    const archivedView = visiblePlays({
      staff: true,
      list: 'archived',
      active: DEMO_PLAYS,
      archived: DEMO_ARCHIVED,
      search: '',
    })
    expect(archivedView.map((play) => play.name)).toEqual(['Mesh'])

    const restored = afterRestore(
      {
        list: 'archived',
        active: DEMO_PLAYS,
        archived: DEMO_ARCHIVED,
        notice: null,
        success: null,
      },
      mesh.id,
      null,
    )
    expect(restored.list).toBe('active')
    expect(restored.archived).toEqual([])
    expect(restored.active.map((play) => play.name)).toEqual(['Flood', 'Iso', 'Mesh'])
    expect(restored.success).toBe('Mesh restored')
    expect(
      visiblePlays({
        staff: true,
        list: restored.list,
        active: restored.active,
        archived: restored.archived,
        search: '',
      }).map((play) => play.name),
    ).toContain('Mesh')
  })

  it('shows an error when restore fails and leaves the play archived', () => {
    const failed = afterRestore(
      {
        list: 'archived',
        active: DEMO_PLAYS,
        archived: DEMO_ARCHIVED,
        notice: null,
        success: null,
      },
      mesh.id,
      new Error('Could not restore this play'),
    )
    expect(failed.notice).toBe('Could not restore this play')
    expect(failed.success).toBeNull()
    expect(failed.list).toBe('archived')
    expect(failed.archived.map((play) => play.name)).toEqual(['Mesh'])
  })

  it('gives staff an Archived tab and hides it from a player', () => {
    const staff = page('/playbook')
    expect(staff).toContain('Archived')
    const player = page('/playbook?roster=player')
    expect(player).not.toContain('Archived')
    expect(player).not.toContain('Mesh')
    expect(player).not.toContain('Restore')
  })

  it('uses a group for the filters and hides editor links', () => {
    const staff = page('/playbook')
    expect(staff).toContain('role="group"')
    expect(staff).not.toContain('tablist')
    expect(staff).not.toContain('Edit play')
    expect(staff).not.toContain('New play')
    expect(staff).not.toContain('Watch')
    expect(staff).toContain('Rename')
    expect(staff).toContain('Delete')
  })

  it('shows Loading while the list is empty and still loading', () => {
    expect(listStatus({ loading: true, count: 0, archived: false })).toBe('Loading…')
    expect(listStatus({ loading: false, count: 0, archived: false })).toBe('No plays')
    expect(listStatus({ loading: false, count: 0, archived: true })).toBe('No archived plays')
    expect(listStatus({ loading: false, count: 2, archived: false })).toBeNull()
  })

  it('honors ?roster=demo only when Supabase is unset or the app is in dev', () => {
    expect(honorDemoRoster('demo', true, false)).toBe(false)
    expect(honorDemoRoster('demo', false, false)).toBe(true)
    expect(honorDemoRoster('demo', true, true)).toBe(true)
    expect(honorDemoRoster('player', true, true)).toBe(false)
  })
})
