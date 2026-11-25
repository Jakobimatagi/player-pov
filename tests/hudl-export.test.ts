import { describe, expect, it } from 'vitest'
import { groupExport, parseClipName } from '../src/film/hudlExport'

describe('Hudl clip names', () => {
  it('reads the angle and clip number', () => {
    expect(parseClipName('Wide - Clip 007.mp4')).toEqual({ angle: 'Wide', playNumber: 7 })
    expect(parseClipName('End Zone - Clip 203.MP4')).toEqual({
      angle: 'End Zone',
      playNumber: 203,
    })
    expect(parseClipName('Game/Sideline - Clip 12.mov')).toEqual({
      angle: 'Sideline',
      playNumber: 12,
    })
  })

  it('rejects anything else', () => {
    expect(parseClipName('breakdown.xlsx')).toBeNull()
    expect(parseClipName('Wide - Clip 000.mp4')).toBeNull()
    expect(parseClipName('Wide Clip 001.mp4')).toBeNull()
    expect(parseClipName('Wide - Clip 001.avi')).toBeNull()
  })
})

describe('grouping an export into plays', () => {
  const names = [
    'End Zone - Clip 002.mp4',
    'Wide - Clip 001.mp4',
    'Wide - Clip 002.mp4',
    'Wide - Clip 003.mp4',
    'End Zone - Clip 001.mp4',
    'breakdown.xlsx',
    'README.txt',
    '__MACOSX/._Wide - Clip 001.mp4',
    '.DS_Store',
  ]

  it('groups clips by number with each angle’s file', () => {
    const g = groupExport(names)
    expect(g.angles).toEqual(['End Zone', 'Wide'])
    expect(g.breakdown).toBe('breakdown.xlsx')
    expect(g.plays).toEqual([
      {
        playNumber: 1,
        angles: { 'End Zone': 'End Zone - Clip 001.mp4', Wide: 'Wide - Clip 001.mp4' },
      },
      {
        playNumber: 2,
        angles: { 'End Zone': 'End Zone - Clip 002.mp4', Wide: 'Wide - Clip 002.mp4' },
      },
      { playNumber: 3, angles: { Wide: 'Wide - Clip 003.mp4' } },
    ])
    expect(g.ignored).toEqual(['README.txt'])
    expect(g.duplicates).toEqual([])
  })

  it('compares clips with breakdown rows only when rows are given', () => {
    expect(groupExport(names).clipsWithoutRow).toEqual([])
    const g = groupExport(names, [1, 2, 4, 5])
    expect(g.clipsWithoutRow).toEqual([3])
    expect(g.rowsWithoutClip).toEqual([4, 5])
  })

  it('reports two files for the same angle and play, and uses the first', () => {
    const g = groupExport(['Wide - Clip 1.mov', 'Wide - Clip 001.mp4', 'Wide - Clip 002.mp4'])
    expect(g.duplicates).toEqual([
      { angle: 'Wide', playNumber: 1, fileNames: ['Wide - Clip 001.mp4', 'Wide - Clip 1.mov'] },
    ])
    expect(g.plays[0]).toEqual({ playNumber: 1, angles: { Wide: 'Wide - Clip 001.mp4' } })
  })

  it('handles an export with no breakdown or a second spreadsheet', () => {
    expect(groupExport(['Wide - Clip 001.mp4']).breakdown).toBeNull()
    const g = groupExport(['b.xlsx', 'a.xlsx', 'Wide - Clip 001.mp4'])
    expect(g.breakdown).toBe('a.xlsx')
    expect(g.ignored).toEqual(['b.xlsx'])
  })

  it('handles an empty list', () => {
    expect(groupExport([])).toEqual({
      plays: [],
      angles: [],
      breakdown: null,
      clipsWithoutRow: [],
      rowsWithoutClip: [],
      duplicates: [],
      ignored: [],
    })
  })
})
