import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LandingPage } from '../src/landing/LandingPage'

describe('landing page', () => {
  const html = renderToStaticMarkup(createElement(LandingPage))

  it('holds paid plans as Coming soon while checkout is off', () => {
    expect(html.match(/Coming soon/g)).toHaveLength(2)
    expect(html).not.toContain('Start with Team')
    expect(html).not.toContain('Start with Program')
    expect(html).toContain('Paid plans open soon.')
    expect(html).toContain('Start free')
  })

  it('gives every image alt text', () => {
    const images = html.match(/<img [^>]*>/g) ?? []
    expect(images.length).toBeGreaterThan(0)
    for (const img of images) expect(img).toMatch(/alt="[^"]+"/)
  })
})
