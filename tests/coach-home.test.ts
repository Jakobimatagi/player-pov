import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CoachHome } from '../src/app/CoachHome'

function render(): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(CoachHome, { name: 'coach@example.com' })),
  )
}

describe('coach home', () => {
  it('links to the playbook and team from the nav and the cards', () => {
    const html = render()
    expect(html).toContain('Coach home')
    expect(html.split('href="/playbook"').length - 1).toBe(3)
    expect(html.split('href="/team"').length - 1).toBe(3)
    expect(html).toContain('aria-label="Coach"')
    expect(html).not.toContain('/dev/editor')
  })

  it('always offers Draw a play, and it opens the diagram editor', () => {
    const html = render()
    expect(html.split('href="/diagram"').length - 1).toBe(3)
    expect(html).toContain('Draw a play')
    expect(html).not.toContain('/dev/editor')
  })
})
