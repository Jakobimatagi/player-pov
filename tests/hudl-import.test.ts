import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { fingerprintClip, readMp4DurationMs, FINGERPRINT_EDGE_BYTES } from '../src/film/clipFile'
import { describeRead, listNumbers, playStatus, playSummary } from '../src/film/chartImportView'
import { filesFromZip, readBreakdownXlsx, titleFromExportName } from '../src/film/exportFiles'
import {
  mostCommonFilm,
  planImport,
  playLengthMs,
  readExport,
  type ReadPlay,
  type SavedClip,
} from '../src/film/hudlImport'
import { openZipEntry, readZipEntries, ZipError } from '../src/film/zipReader'
import { makeMp4, makeXlsx, makeZip, type FixtureFile } from './zip-fixture'

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer())
const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer())
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

describe('zip reader', () => {
  const files: FixtureFile[] = [
    { name: 'Game/Wide - Clip 001.mp4', data: 'stored video bytes' },
    { name: 'Game/breakdown.xlsx', data: 'x'.repeat(5000), deflate: true },
    { name: 'Game/Ünïcode – Clip 002.mp4', data: 'utf-8 name' },
  ]

  it('lists entries with their sizes and skips folders', async () => {
    const zip = makeZip(files, { folders: ['Game/'] })
    const entries = await readZipEntries(zip)
    expect(entries.map((e) => [e.name, e.size, e.method])).toEqual([
      ['Game/Wide - Clip 001.mp4', 18, 0],
      ['Game/breakdown.xlsx', 5000, 8],
      ['Game/Ünïcode – Clip 002.mp4', 10, 0],
    ])
  })

  it('opens stored entries as slices and inflates deflated ones', async () => {
    const zip = makeZip(files)
    const [stored, deflated] = await readZipEntries(zip)
    expect(await text(await openZipEntry(zip, stored!))).toBe('stored video bytes')
    expect(await text(await openZipEntry(zip, deflated!))).toBe('x'.repeat(5000))
  })

  it('reads Zip64 sizes and offsets', async () => {
    const zip = makeZip(files, { zip64: true })
    const entries = await readZipEntries(zip)
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ['Game/Wide - Clip 001.mp4', 18],
      ['Game/breakdown.xlsx', 5000],
      ['Game/Ünïcode – Clip 002.mp4', 10],
    ])
    expect(await text(await openZipEntry(zip, entries[1]!))).toBe('x'.repeat(5000))
  })

  it('refuses a file that is not a zip', async () => {
    await expect(
      readZipEntries(new Blob(['not a zip at all, just some text here'])),
    ).rejects.toThrow(ZipError)
    await expect(readZipEntries(new Blob(['tiny']))).rejects.toThrow(ZipError)
  })
})

describe('clip fingerprint', () => {
  it('hashes a small clip whole', async () => {
    const data = new Uint8Array(1000).fill(7)
    expect(await fingerprintClip(new Blob([data]))).toEqual({ size: 1000, sha256: sha(data) })
  })

  it('hashes the first and last MiB of a large clip', async () => {
    const edge = FINGERPRINT_EDGE_BYTES
    const data = new Uint8Array(3 * edge)
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 31) & 0xff
    const expected = sha(new Uint8Array([...data.subarray(0, edge), ...data.subarray(2 * edge)]))
    const fp = await fingerprintClip(new Blob([data]))
    expect(fp).toEqual({ size: 3 * edge, sha256: expected })

    const lastByteChanged = data.slice()
    const last = lastByteChanged.length - 1
    lastByteChanged[last] = lastByteChanged[last]! ^ 1
    expect((await fingerprintClip(new Blob([lastByteChanged]))).sha256).not.toBe(fp.sha256)
  })
})

describe('MP4 length', () => {
  it('reads mvhd with moov at the end or the start', async () => {
    expect(await readMp4DurationMs(new Blob([makeMp4(7_250)]))).toBe(7_250)
    expect(await readMp4DurationMs(new Blob([makeMp4(12_000, { moovFirst: true })]))).toBe(12_000)
    expect(await readMp4DurationMs(new Blob([makeMp4(9_500, { version: 1 })]))).toBe(9_500)
  })

  it('skips a large mdat without reading it', async () => {
    const clip = new Blob([makeMp4(5_000, { mdatBytes: 3 * 1024 * 1024 })])
    expect(await readMp4DurationMs(clip)).toBe(5_000)
  })

  it('gives null for files without a movie header', async () => {
    expect(await readMp4DurationMs(new Blob(['not a video']))).toBeNull()
    expect(await readMp4DurationMs(new Blob([]))).toBeNull()
  })
})

describe('breakdown.xlsx', () => {
  it('reads the first sheet keyed by header', async () => {
    const xlsx = makeXlsx([
      ['PLAY #', 'ODK', 'DN', 'DIST', 'OFF FORM'],
      ['1', 'O', '1', '10', 'Trips Rt'],
      ['2', 'D', '', '', ''],
    ])
    expect(await readBreakdownXlsx(xlsx)).toEqual([
      { 'PLAY #': '1', ODK: 'O', DN: '1', DIST: '10', 'OFF FORM': 'Trips Rt' },
      { 'PLAY #': '2', ODK: 'D' },
    ])
  })

  it('names the game after the export', () => {
    expect(titleFromExportName('Mountain Ridge vs Corner Canyon.zip')).toBe(
      'Mountain Ridge vs Corner Canyon',
    )
    expect(titleFromExportName('exports/week_9_export.ZIP')).toBe('week 9 export')
  })
})

/**
 * The shape of the Mountain Ridge vs Corner Canyon export: 205 Wide clips, 203 End Zone
 * clips (none for plays 45 and 95) and 205 breakdown rows.
 */
async function testExport(): Promise<Blob> {
  const clip = (n: number) => String(n).padStart(3, '0')
  const rows = [['PLAY #', 'ODK', 'QTR', 'DN', 'DIST', 'HASH', 'YARD LN', 'OFF FORM', 'PLAY TYPE']]
  const files: FixtureFile[] = []
  for (let n = 1; n <= 205; n += 1) {
    rows.push([
      String(n),
      n % 2 ? 'D' : 'O',
      String(1 + Math.floor((n - 1) / 52)),
      String(1 + (n % 4)),
      String(n % 11),
      'M',
      '-25',
      'Trips Rt',
      'Run',
    ])
    files.push({
      name: `MR vs CC/Wide - Clip ${clip(n)}.mp4`,
      data: makeMp4(6000 + n * 10, { seed: n }),
    })
    if (n !== 45 && n !== 95) {
      files.push({
        name: `MR vs CC/End Zone - Clip ${clip(n)}.mp4`,
        data: makeMp4(6100 + n * 10, { seed: 1000 + n }),
      })
    }
  }
  files.push({ name: 'MR vs CC/breakdown.xlsx', data: await bytes(makeXlsx(rows)) })
  files.push({ name: '__MACOSX/MR vs CC/._Wide - Clip 001.mp4', data: 'junk' })
  return makeZip(files, { folders: ['MR vs CC/'] })
}

describe('reading a Hudl export', () => {
  it('turns the 205-play export into plays with tags, files and lengths', async () => {
    const zip = await testExport()
    const progress: number[] = []
    const read = await readExport(await filesFromZip(zip), {
      onProgress: (p) => progress.push(p.done),
    })

    expect(read.plays).toHaveLength(205)
    expect(read.plays.reduce((n, p) => n + p.files.length, 0)).toBe(408)
    expect(read.groups.angles).toEqual(['End Zone', 'Wide'])
    expect(read.groups.clipsWithoutRow).toEqual([])
    expect(read.groups.rowsWithoutClip).toEqual([])
    expect(read.groups.duplicates).toEqual([])
    expect(read.plays.filter((p) => p.files.length === 1).map((p) => p.playNumber)).toEqual([
      45, 95,
    ])
    expect(progress.at(-1)).toBe(408)

    const seven = read.plays[6]!
    expect(seven.playNumber).toBe(7)
    expect(seven.tags).toMatchObject({
      play_number: 7,
      side: 'defense',
      quarter: 1,
      down: 4,
      distance: 7,
      hash: 'M',
      yard_line: -25,
      formation: 'Trips Rt',
      tags: { play_type: 'Run' },
    })
    expect(seven.files.map((f) => [f.angle, f.fileName, f.durationMs])).toEqual([
      ['End Zone', 'MR vs CC/End Zone - Clip 007.mp4', 6170],
      ['Wide', 'MR vs CC/Wide - Clip 007.mp4', 6070],
    ])
    expect(playLengthMs(seven)).toBe(6170)
    const fingerprints = new Set(read.plays.flatMap((p) => p.files.map((f) => f.sha256)))
    expect(fingerprints.size).toBe(408)
  })

  it('reports clips without rows, rows without clips and repeated rows', async () => {
    const rows = [
      ['PLAY #', 'ODK'],
      ['1', 'O'],
      ['1', 'D'],
      ['3', 'O'],
      ['', 'K'],
    ]
    const zip = makeZip([
      { name: 'Wide - Clip 001.mp4', data: makeMp4(5000, { seed: 1 }) },
      { name: 'Wide - Clip 002.mp4', data: makeMp4(5000, { seed: 2 }) },
      { name: 'breakdown.xlsx', data: await bytes(makeXlsx(rows)) },
    ])
    const read = await readExport(await filesFromZip(zip))
    expect(read.groups.clipsWithoutRow).toEqual([2])
    expect(read.groups.rowsWithoutClip).toEqual([3])
    expect(read.duplicateRows).toEqual([1])
    expect(read.rowsWithoutNumber).toBe(1)
    expect(read.plays[0]!.tags?.side).toBe('offense')
    expect(read.plays[1]!.tags).toBeNull()

    const { problems } = describeRead(read, null)
    expect(problems).toEqual([
      '1 clip with no breakdown row: play 2.',
      '1 breakdown row with no clip: play 3. These are not saved.',
      'The breakdown lists play 1 more than once; the first row is used.',
      '1 breakdown row without a PLAY # were skipped.',
    ])
  })

  it('falls back to the given duration reader for clips without an MP4 header', async () => {
    const zip = makeZip([{ name: 'Wide - Clip 001.mov', data: 'not an mp4' }])
    const read = await readExport(await filesFromZip(zip), { readDuration: async () => 4321 })
    expect(read.plays[0]!.files[0]!.durationMs).toBe(4321)
  })
})

describe('matching a re-opened export', () => {
  const fp = (n: number) => ({ size: 1000 + n, sha256: String(n).padStart(64, '0') })
  const play = (
    n: number,
    angles: Record<string, number>,
    durationMs: number | null = 5000,
  ): ReadPlay => ({
    playNumber: n,
    tags: null,
    files: Object.entries(angles).map(([angle, id]) => ({
      angle,
      fileName: `${angle} - Clip ${n}.mp4`,
      durationMs,
      ...fp(id),
    })),
  })
  const plays = [
    play(1, { 'End Zone': 101, Wide: 1 }),
    play(2, { 'End Zone': 102, Wide: 2 }),
    play(3, { Wide: 3 }),
  ]

  it('adds everything to a new game', () => {
    const plan = planImport(plays, [])
    expect(plan.add.map((p) => p.playNumber)).toEqual([1, 2, 3])
    expect(plan.matched).toEqual([])
  })

  it('matches saved clips by fingerprint instead of adding them again', () => {
    const saved: SavedClip[] = [
      {
        id: 'c1',
        playNumber: 1,
        files: [
          { angle: 'Wide', ...fp(1) },
          { angle: 'End Zone', ...fp(101) },
        ],
      },
      { id: 'c2', playNumber: 2, files: [{ angle: 'Wide', ...fp(2) }] },
      { id: 'c3', playNumber: 3, files: [{ angle: 'Wide', ...fp(3) }] },
    ]
    const plan = planImport(plays, saved)
    expect(plan.add).toEqual([])
    expect(plan.matched.map((m) => [m.clipId, m.newFiles.map((f) => f.angle)])).toEqual([
      ['c1', []],
      ['c2', ['End Zone']],
      ['c3', []],
    ])
    expect(playStatus(plays[0]!, plan)).toBe('saved')
  })

  it('leaves a saved play alone when its clips differ, and skips clips with no length', () => {
    const saved: SavedClip[] = [{ id: 'c2', playNumber: 2, files: [{ angle: 'Wide', ...fp(999) }] }]
    const plan = planImport([...plays, play(4, { Wide: 4 }, null)], saved)
    expect(plan.conflicts.map((c) => [c.play.playNumber, c.clipId])).toEqual([[2, 'c2']])
    expect(plan.unreadable.map((p) => p.playNumber)).toEqual([4])
    expect(plan.add.map((p) => p.playNumber)).toEqual([1, 3])
    expect(playStatus(plays[1]!, plan)).toBe('clash')
  })

  it('picks the film most fingerprints point at', () => {
    expect(mostCommonFilm([{ filmId: 'a' }, { filmId: 'b' }, { filmId: 'b' }])).toBe('b')
    expect(mostCommonFilm([])).toBeNull()
  })

  it('caps a play at ten minutes', () => {
    expect(playLengthMs(play(1, { Wide: 1 }, 900_000))).toBe(600_000)
    expect(playLengthMs(play(1, { Wide: 1 }, null))).toBeNull()
  })
})

describe('import screen wording', () => {
  it('lists play numbers briefly', () => {
    expect(listNumbers([45])).toBe('45')
    expect(listNumbers([45, 95])).toBe('45 and 95')
    expect(listNumbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('1, 2, 3, 4, 5, 6, 7, 8 and 2 more')
  })

  it('summarises a play', () => {
    const p: ReadPlay = {
      playNumber: 7,
      tags: {
        play_number: 7,
        side: 'offense',
        quarter: 2,
        down: 3,
        distance: 4,
        hash: 'L',
        yard_line: -25,
        personnel: null,
        formation: 'Trips Rt',
        front: null,
        coverage: null,
        result: null,
        gain_loss: null,
        tags: {},
      },
      files: [{ angle: 'Wide', fileName: 'w', durationMs: 1, size: 1, sha256: '' }],
    }
    expect(playSummary(p)).toEqual({
      situation: 'O · Q2 · 3rd & 4 · -25',
      formation: 'Trips Rt',
      angles: 'Wide',
    })
  })
})
