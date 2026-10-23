import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { afterRestore, DEMO_ARCHIVED, DEMO_PLAYS, visiblePlays } from '../src/playbook/archive'
import { PlaybookPage } from '../src/playbook/PlaybookPage'

function page(path: string): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(PlaybookPage)),
  )
}

const mesh = DEMO_ARCHIVED[0]

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
})
