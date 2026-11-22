import { describe, expect, it } from 'vitest'
import {
  FILM_MAX_BYTES,
  fileProblem,
  formatBytes,
  partSizeFor,
  planParts,
  remainingParts,
} from '../src/film/uploadPlan'

const MIB = 1024 * 1024
const GIB = 1024 * MIB

describe('partSizeFor', () => {
  it('uses 16 MiB parts for ordinary game files', () => {
    expect(partSizeFor(2 * GIB)).toBe(16 * MIB)
  })

  it('grows parts so a 20 GiB file stays under 9,000 parts', () => {
    const size = partSizeFor(FILM_MAX_BYTES)
    expect(size % MIB).toBe(0)
    expect(Math.ceil(FILM_MAX_BYTES / size)).toBeLessThanOrEqual(9000)
  })
})

describe('planParts', () => {
  it('covers every byte once, numbered from 1, with a short last part', () => {
    const parts = planParts(40 * MIB + 5, 16 * MIB)
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3])
    expect(parts[0]).toEqual({ partNumber: 1, start: 0, end: 16 * MIB })
    expect(parts[2]).toEqual({ partNumber: 3, start: 32 * MIB, end: 40 * MIB + 5 })
  })

  it('returns nothing for an empty file', () => {
    expect(planParts(0, 16 * MIB)).toEqual([])
  })
})

describe('remainingParts', () => {
  it('skips parts already stored at full size and resends partial ones', () => {
    const plan = planParts(48 * MIB, 16 * MIB)
    const left = remainingParts(plan, [
      { partNumber: 1, etag: '"a"', size: 16 * MIB },
      { partNumber: 2, etag: '"b"', size: 3 },
    ])
    expect(left.map((p) => p.partNumber)).toEqual([2, 3])
  })
})

describe('fileProblem', () => {
  it('accepts an MP4 that fits', () => {
    expect(fileProblem({ size: GIB, type: 'video/mp4' }, 10 * GIB)).toBeNull()
  })

  it('refuses other types, oversize files and a full quota', () => {
    expect(fileProblem({ size: GIB, type: 'video/x-msvideo' }, 10 * GIB)).toMatch(/MP4/)
    expect(fileProblem({ size: FILM_MAX_BYTES + 1, type: 'video/mp4' }, 100 * GIB)).toMatch(/20 GB/)
    expect(fileProblem({ size: 2 * GIB, type: 'video/mp4' }, GIB)).toBe(
      'Not enough team film storage left (1.0 GB free).',
    )
  })
})

describe('formatBytes', () => {
  it('formats sizes for coaches', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1.5 * GIB)).toBe('1.5 GB')
    expect(formatBytes(10 * GIB)).toBe('10 GB')
  })
})
