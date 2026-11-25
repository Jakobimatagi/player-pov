import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { FilmPage } from '../src/film/FilmPage'
import {
  formatDuration,
  formatGameDate,
  packWeekLabel,
  progressLabel,
  statusLabel,
  titleFromFileName,
  usagePercent,
} from '../src/film/filmView'

const GIB = 1024 ** 3

describe('film view helpers', () => {
  it('names each film state for coaches', () => {
    expect(statusLabel('uploading')).toBe('Upload not finished')
    expect(statusLabel('processing')).toBe('Processing')
    expect(statusLabel('ready')).toBe('Ready')
    expect(statusLabel('failed')).toBe('Upload failed')
  })

  it('suggests a title from the file name', () => {
    expect(titleFromFileName('Lincoln at Central.mp4')).toBe('Lincoln at Central')
    expect(titleFromFileName('week_11_eastside.MOV')).toBe('week 11 eastside')
    expect(titleFromFileName('x'.repeat(200) + '.mp4')).toHaveLength(120)
  })

  it('formats game length', () => {
    expect(formatDuration(5_400_000)).toBe('1:30:00')
    expect(formatDuration(754_000)).toBe('12:34')
    expect(formatDuration(null)).toBe('—')
  })

  it('formats a game date without shifting the day', () => {
    expect(formatGameDate('2026-11-20')).toContain('20')
    expect(formatGameDate('2026-11-20')).toContain('2026')
    expect(formatGameDate(null)).toBe('—')
  })

  it('reports upload progress and storage use', () => {
    expect(progressLabel(GIB, 4 * GIB)).toBe('1.0 GB of 4.0 GB · 25%')
    expect(progressLabel(0, 0)).toBe('0 B of 0 B · 0%')
    expect(usagePercent(5 * GIB, 10 * GIB)).toBe(50)
    expect(usagePercent(12 * GIB, 10 * GIB)).toBe(100)
    expect(usagePercent(1, 0)).toBe(100)
  })

  it('labels a scout pack week with its opponent', () => {
    expect(packWeekLabel('Lincoln High', 'Week of Nov 23')).toBe('Lincoln High · Week of Nov 23')
    expect(packWeekLabel(null, 'Week of Nov 23')).toBe('Week of Nov 23')
  })
})

describe('film page (no backend)', () => {
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ['/film'] }, createElement(FilmPage)),
  )

  it('shows the demo note, storage use and the add form', () => {
    expect(html).toContain('Game film')
    expect(html).toContain('Example film. Connect a backend')
    expect(html).toContain('3.9 GB of 10 GB used')
    expect(html).toContain('Add film')
    expect(html).toContain('id="film-file"')
    expect(html).toContain('No scout packs yet')
  })

  it('lists film with status, details and actions', () => {
    expect(html).toContain('Lincoln at Central')
    expect(html).toContain('Lincoln High')
    expect(html).toContain('1:32:00')
    expect(html).toContain('Ready')
    expect(html).toContain('Watch')
    expect(html).toContain('Upload not finished')
    expect(html).toContain('Resume upload')
    expect(html).toContain('Choose the same file (922 MB)')
  })

  it('disables uploading in the demo', () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/)
  })

  it('offers Import plays on ready film only, disabled in the demo', () => {
    expect(html.match(/Import plays/g)).toHaveLength(2)
    expect(html).toMatch(/<input[^>]*id="film-import-demo-1"[^>]*disabled/)
    expect(html).not.toContain('film-import-demo-3')
  })
})
