import { describe, expect, it } from 'vitest'
import {
  breakdownRows,
  buildPlaysFile,
  columnIndex,
  parseClipName,
  parsePlaysFile,
  playSummary,
  playTags,
  playsForFilm,
  readSheet,
  tagKey,
  timeline,
} from '../src/film/hudlBreakdown'

const SHARED = `<sst><si><t>PLAY #</t></si><si><t>ODK</t></si><si><t>OFF FORM</t></si>
<si><r><t>DOU</t></r><r><t>BLES</t></r></si><si><t>DEF FRONT</t></si><si><t>KINGS &amp; ODD</t></si>
<si><t>BLITZ</t></si><si><t>O</t></si></sst>`

// Row 3 skips column C, so values must be placed by reference, not by order.
const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>4</v></c><c r="E1" t="s"><v>6</v></c></row>
<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>7</v></c><c r="C2" t="s"><v>3</v></c></row>
<row r="3"><c r="A3"><v>2</v></c><c r="B3" t="inlineStr"><is><t>D</t></is></c><c r="C3" s="2"/><c r="D3" t="s"><v>5</v></c><c r="E3" t="inlineStr"><is><t>FIN</t></is></c></row>
</sheetData></worksheet>`

describe('reading breakdown.xlsx', () => {
  it('maps column letters', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AA2')).toBe(26)
    expect(columnIndex('DA1')).toBe(104)
  })

  it('places cells by reference and joins rich text', () => {
    const rows = breakdownRows(readSheet(SHEET, SHARED))
    expect(rows).toEqual([
      { 'PLAY #': '1', ODK: 'O', 'OFF FORM': 'DOUBLES' },
      { 'PLAY #': '2', ODK: 'D', 'DEF FRONT': 'KINGS & ODD', BLITZ: 'FIN' },
    ])
  })
})

describe('breakdown row → clip columns', () => {
  it('fills the film_clips columns and keeps the rest as tags', () => {
    const p = playTags({
      'PLAY #': '7',
      ODK: 'D',
      QTR: '1',
      DN: '1',
      DIST: '9',
      HASH: 'l',
      'YARD LN': '9',
      'OFF FORM': 'Slot Wing',
      'OFF STR': 'L',
      'DEF FRONT': 'UNDER',
      COVERAGE: '3 AUTO',
      RESULT: 'Rush',
      'GN/LS': '5',
      'MR COV (1)': 'ignored because COVERAGE is set',
      BLITZ: 'FIN',
    })
    expect(p).toMatchObject({
      play_number: 7,
      side: 'defense',
      quarter: 1,
      down: 1,
      distance: 9,
      hash: 'L',
      yard_line: 9,
      formation: 'Slot Wing',
      front: 'UNDER',
      coverage: '3 AUTO',
      result: 'Rush',
      gain_loss: 5,
    })
    expect(p.tags).toEqual({
      off_str: 'L',
      mr_cov_1: 'ignored because COVERAGE is set',
      blitz: 'FIN',
    })
  })

  it('drops values the table would refuse', () => {
    const p = playTags({
      DN: '0',
      DIST: '204',
      'YARD LN': '-50',
      'GN/LS': '144',
      QTR: 'Bob',
      HASH: 'X',
    })
    expect(p).toMatchObject({
      down: null,
      distance: null,
      yard_line: 50,
      gain_loss: null,
      quarter: null,
      hash: null,
    })
  })

  it('maps ODK and keeps unknown letters as a tag', () => {
    expect(playTags({ ODK: 'O' }).side).toBe('offense')
    expect(playTags({ ODK: 'K' }).side).toBe('kick')
    const s = playTags({ ODK: 'S' })
    expect(s.side).toBeNull()
    expect(s.tags.odk).toBe('S')
  })

  it('uses the MR columns when the main ones are blank, and caps text at 40', () => {
    const p = playTags({ 'MR FRONT': 'HEADS', 'MR COV (1)': 'x'.repeat(60) })
    expect(p.front).toBe('HEADS')
    expect(p.coverage).toHaveLength(40)
  })

  it('keeps tags under 4 KB', () => {
    const row: Record<string, string> = {}
    for (let i = 0; i < 100; i += 1) row[`NOTE ${i}`] = 'y'.repeat(150)
    const bytes = new TextEncoder().encode(JSON.stringify(playTags(row).tags)).length
    expect(bytes).toBeLessThanOrEqual(4096)
  })

  it('makes tag keys', () => {
    expect(tagKey('OFF STR')).toBe('off_str')
    expect(tagKey('MR COV (1)')).toBe('mr_cov_1')
  })
})

describe('joining clips', () => {
  it('reads Hudl clip names', () => {
    expect(parseClipName('Wide - Clip 007.mp4')).toEqual({ angle: 'Wide', playNumber: 7 })
    expect(parseClipName('End Zone - Clip 203.MP4')).toEqual({ angle: 'End Zone', playNumber: 203 })
    expect(parseClipName('breakdown.xlsx')).toBeNull()
  })

  it('lays clips end to end', () => {
    expect(
      timeline([
        { playNumber: 1, durationMs: 7000 },
        { playNumber: 3, durationMs: 12_500 },
      ]),
    ).toEqual([
      { playNumber: 1, startMs: 0, endMs: 7000 },
      { playNumber: 3, startMs: 7000, endMs: 19_500 },
    ])
  })

  it('builds a plays file and reports breakdown rows with no clip', () => {
    const { file, missing } = buildPlaysFile({
      title: 'MR vs CC',
      angle: 'End Zone',
      clips: [
        { playNumber: 1, durationMs: 5000 },
        { playNumber: 3, durationMs: 8000 },
      ],
      rows: [
        { 'PLAY #': '1', ODK: 'O', 'OFF FORM': 'TRIPS' },
        { 'PLAY #': '2', ODK: 'D' },
        { 'PLAY #': '3', ODK: 'D', 'DEF FRONT': 'ODD' },
      ],
    })
    expect(missing).toEqual([2])
    expect(file.durationMs).toBe(13_000)
    expect(file.plays.map((p) => [p.play_number, p.start_ms, p.end_ms, p.side])).toEqual([
      [1, 0, 5000, 'offense'],
      [3, 5000, 13_000, 'defense'],
    ])
    expect(parsePlaysFile(JSON.parse(JSON.stringify(file)))).toEqual({ ok: true, file })
  })
})

describe('importing a plays file', () => {
  const { file } = buildPlaysFile({
    title: 't',
    angle: 'Wide',
    clips: [
      { playNumber: 1, durationMs: 60_000 },
      { playNumber: 2, durationMs: 60_000 },
    ],
    rows: [],
  })

  it('refuses something that is not a plays file', () => {
    const r = parsePlaysFile({ hello: 1 })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/not a plays file/)
  })

  it('keeps ends inside the film when lengths differ slightly', () => {
    const r = playsForFilm(file, 119_000)
    expect(r.ok && r.plays.at(-1)?.end_ms).toBe(119_000)
  })

  it('refuses a plays file for a video of another length', () => {
    const r = playsForFilm(file, 300_000)
    expect(!r.ok && r.error).toBe(
      'These plays are for a 2:00 video, and this film is 5:00. Check you chose the plays file for this angle.',
    )
    expect(playsForFilm(file, null).ok).toBe(false)
  })

  it('summarises a play', () => {
    expect(
      playSummary({ down: 3, distance: 4, formation: 'TRIPS', front: 'KINGS', coverage: 'FIRE' }),
    ).toBe('3rd & 4 · TRIPS · KINGS / FIRE')
    expect(
      playSummary({ down: null, distance: null, formation: null, front: null, coverage: null }),
    ).toBe('')
  })
})
