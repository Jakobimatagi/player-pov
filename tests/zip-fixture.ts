/** Builds zips, xlsx files and MP4 headers in memory for the import tests. */
import { deflateRawSync } from 'node:zlib'

export interface FixtureFile {
  name: string
  data: Uint8Array | string
  deflate?: boolean
}

const enc = new TextEncoder()
const bytesOf = (d: Uint8Array | string) => (typeof d === 'string' ? enc.encode(d) : d)

class Writer {
  parts: Uint8Array[] = []
  length = 0
  push(b: Uint8Array) {
    this.parts.push(b)
    this.length += b.length
  }
  fields(spec: [number, number][]) {
    const size = spec.reduce((n, [w]) => n + w, 0)
    const v = new DataView(new ArrayBuffer(size))
    let at = 0
    for (const [w, value] of spec) {
      if (w === 2) v.setUint16(at, value, true)
      else if (w === 4) v.setUint32(at, value, true)
      else v.setBigUint64(at, BigInt(value), true)
      at += w
    }
    this.push(new Uint8Array(v.buffer))
  }
}

/** A zip. `zip64` writes every size and offset through the Zip64 records. */
export function makeZip(
  files: FixtureFile[],
  options: { zip64?: boolean; folders?: string[] } = {},
): Blob {
  const out = new Writer()
  const central = new Writer()
  const z64 = options.zip64 === true
  const all: FixtureFile[] = [
    ...(options.folders ?? []).map((name) => ({ name, data: '' })),
    ...files,
  ]
  for (const f of all) {
    const raw = bytesOf(f.data)
    const data = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw
    const name = enc.encode(f.name)
    const method = f.deflate ? 8 : 0
    const offset = out.length
    out.fields([
      [4, 0x04034b50],
      [2, 20],
      [2, 0x0800],
      [2, method],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, data.length],
      [4, raw.length],
      [2, name.length],
      [2, 0],
    ])
    out.push(name)
    out.push(data)

    central.fields([
      [4, 0x02014b50],
      [2, 45],
      [2, 45],
      [2, 0x0800],
      [2, method],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, z64 ? 0xffffffff : data.length],
      [4, z64 ? 0xffffffff : raw.length],
      [2, name.length],
      [2, z64 ? 28 : 0],
      [2, 0],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, z64 ? 0xffffffff : offset],
    ])
    central.push(name)
    if (z64) {
      central.fields([
        [2, 0x0001],
        [2, 24],
        [8, raw.length],
        [8, data.length],
        [8, offset],
      ])
    }
  }
  const dirOffset = out.length
  for (const p of central.parts) out.push(p)
  const dirSize = central.length
  if (z64) {
    const recordAt = out.length
    out.fields([
      [4, 0x06064b50],
      [8, 44],
      [2, 45],
      [2, 45],
      [4, 0],
      [4, 0],
      [8, all.length],
      [8, all.length],
      [8, dirSize],
      [8, dirOffset],
    ])
    out.fields([
      [4, 0x07064b50],
      [4, 0],
      [8, recordAt],
      [4, 1],
    ])
  }
  out.fields([
    [4, 0x06054b50],
    [2, 0],
    [2, 0],
    [2, z64 ? 0xffff : all.length],
    [2, z64 ? 0xffff : all.length],
    [4, z64 ? 0xffffffff : dirSize],
    [4, z64 ? 0xffffffff : dirOffset],
    [2, 0],
  ])
  return new Blob(out.parts as BlobPart[])
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** A one-sheet xlsx with shared strings, the way Excel and Hudl write it. */
export function makeXlsx(rows: string[][]): Blob {
  const strings: string[] = []
  const index = (s: string) => {
    const i = strings.indexOf(s)
    return i >= 0 ? i : strings.push(s) - 1
  }
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((v, c) =>
            v === ''
              ? ''
              : /^-?\d+$/.test(v)
                ? `<c r="${colName(c)}${r + 1}"><v>${v}</v></c>`
                : `<c r="${colName(c)}${r + 1}" t="s"><v>${index(v)}</v></c>`,
          )
          .join('')}</row>`,
    )
    .join('')
  return makeZip([
    {
      name: 'xl/workbook.xml',
      data: '<workbook><sheets><sheet name="Breakdown" sheetId="1" r:id="rId1"/></sheets></workbook>',
      deflate: true,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      deflate: true,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<worksheet><sheetData>${body}</sheetData></worksheet>`,
      deflate: true,
    },
    {
      name: 'xl/sharedStrings.xml',
      data: `<sst>${strings.map((s) => `<si><t>${xmlEscape(s)}</t></si>`).join('')}</sst>`,
      deflate: true,
    },
  ])
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set(enc.encode(type), 4)
  out.set(payload, 8)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * A minimal MP4: ftyp, an mdat of `mdatBytes` (seeded so every clip differs), and a moov
 * with an mvhd giving the length. moov goes at the end unless `moovFirst`.
 */
export function makeMp4(
  durationMs: number,
  options: { seed?: number; mdatBytes?: number; moovFirst?: boolean; version?: 0 | 1 } = {},
): Uint8Array<ArrayBuffer> {
  const version = options.version ?? 0
  const timescale = 90000
  const duration = Math.round((durationMs / 1000) * timescale)
  const mvhd = new Uint8Array(version === 1 ? 112 : 100)
  const v = new DataView(mvhd.buffer)
  v.setUint8(0, version)
  if (version === 1) {
    v.setUint32(20, timescale)
    v.setBigUint64(24, BigInt(duration))
  } else {
    v.setUint32(12, timescale)
    v.setUint32(16, duration)
  }
  const moov = box('moov', box('mvhd', mvhd))
  const media = new Uint8Array(options.mdatBytes ?? 64)
  let x = (options.seed ?? 1) * 2654435761
  for (let i = 0; i < media.length; i += 1) {
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    media[i] = x & 0xff
  }
  const ftyp = box('ftyp', enc.encode('isom\0\0\0\0isomavc1'))
  const mdat = box('mdat', media)
  return concat(options.moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov])
}
