import { describe, expect, it } from 'vitest'
import { breakdownRows, columnIndex, playTags, readSheet, tagKey } from '../src/film/hudlBreakdown'

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
