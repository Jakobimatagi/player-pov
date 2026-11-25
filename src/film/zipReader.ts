/**
 * Reads a zip in the browser without loading it: the central directory is parsed from the
 * end of the file, and each entry is a slice of the original Blob. Stored entries (what a
 * video export usually holds) cost nothing to open; deflated ones are inflated with
 * DecompressionStream. Handles Zip64, so exports over 4 GB and with over 65,535 files work.
 * No CRC check: a clip's bytes are fingerprinted and decoded later, which catches damage.
 */

export interface ZipEntry {
  /** Path inside the zip, with forward slashes. */
  name: string
  /** Uncompressed size in bytes. */
  size: number
  compressedSize: number
  /** 0 stored, 8 deflate. */
  method: number
  /** Where the entry's local header starts. */
  localHeaderOffset: number
  encrypted: boolean
}

const EOCD = 0x06054b50
const ZIP64_LOCATOR = 0x07064b50
const ZIP64_EOCD = 0x06064b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const MAX_COMMENT = 0xffff

export class ZipError extends Error {}

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer()
  if (buf.byteLength !== end - start) throw new ZipError('The zip ends early.')
  return new DataView(buf)
}

/** 64-bit little-endian as a number; zips past 2^53 bytes don't exist in practice. */
function u64(view: DataView, at: number): number {
  return view.getUint32(at, true) + view.getUint32(at + 4, true) * 2 ** 32
}

// Names are UTF-8 when flag bit 11 is set, else CP437. Clip names are ASCII either way, so
// CP437 is read as UTF-8 with a Latin-1 fallback rather than shipping a code page table.
const utf8 = new TextDecoder('utf-8', { fatal: true })
const latin1 = new TextDecoder('latin1')
function decodeName(raw: Uint8Array): string {
  try {
    return utf8.decode(raw)
  } catch {
    return latin1.decode(raw)
  }
}

/** Lists the entries of a zip. Folders (names ending in /) are left out. */
export async function readZipEntries(zip: Blob): Promise<ZipEntry[]> {
  const tailLength = Math.min(zip.size, 22 + MAX_COMMENT + 20)
  if (tailLength < 22) throw new ZipError('This is not a zip file.')
  const tailStart = zip.size - tailLength
  const tail = await bytes(zip, tailStart, zip.size)

  let eocd = -1
  for (let i = tailLength - 22; i >= 0; i -= 1) {
    if (tail.getUint32(i, true) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ZipError('This is not a zip file.')

  let count = tail.getUint16(eocd + 10, true)
  let dirSize = tail.getUint32(eocd + 12, true)
  let dirOffset = tail.getUint32(eocd + 16, true)

  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    const loc = eocd - 20
    if (loc < 0 || tail.getUint32(loc, true) !== ZIP64_LOCATOR) {
      throw new ZipError('This zip is missing its Zip64 directory.')
    }
    const recordAt = u64(tail, loc + 8)
    const record = await bytes(zip, recordAt, recordAt + 56)
    if (record.getUint32(0, true) !== ZIP64_EOCD) {
      throw new ZipError('This zip is missing its Zip64 directory.')
    }
    count = u64(record, 32)
    dirSize = u64(record, 40)
    dirOffset = u64(record, 48)
  }
  if (dirOffset + dirSize > zip.size) throw new ZipError('The zip ends early.')

  const dir = await bytes(zip, dirOffset, dirOffset + dirSize)
  const entries: ZipEntry[] = []
  let at = 0
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > dir.byteLength || dir.getUint32(at, true) !== CENTRAL) {
      throw new ZipError('The zip directory is damaged.')
    }
    const flags = dir.getUint16(at + 8, true)
    const method = dir.getUint16(at + 10, true)
    let compressedSize = dir.getUint32(at + 20, true)
    let size = dir.getUint32(at + 24, true)
    const nameLength = dir.getUint16(at + 28, true)
    const extraLength = dir.getUint16(at + 30, true)
    const commentLength = dir.getUint16(at + 32, true)
    let localHeaderOffset = dir.getUint32(at + 42, true)
    const nameStart = at + 46
    const name = decodeName(
      new Uint8Array(dir.buffer, dir.byteOffset + nameStart, nameLength),
    ).replace(/\\/g, '/')

    // Zip64 extra field: the 64-bit values, in this order, only for fields that are 0xFFFFFFFF.
    let x = nameStart + nameLength
    const extraEnd = x + extraLength
    while (x + 4 <= extraEnd) {
      const id = dir.getUint16(x, true)
      const len = dir.getUint16(x + 2, true)
      if (id === 0x0001) {
        let p = x + 4
        if (size === 0xffffffff) {
          size = u64(dir, p)
          p += 8
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(dir, p)
          p += 8
        }
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = u64(dir, p)
      }
      x += 4 + len
    }

    if (!name.endsWith('/')) {
      entries.push({
        name,
        size,
        compressedSize,
        method,
        localHeaderOffset,
        encrypted: (flags & 1) === 1,
      })
    }
    at = extraEnd + commentLength
  }
  return entries
}

/** Where an entry's data starts: past its local header, whose extra field can differ. */
async function dataStart(zip: Blob, entry: ZipEntry): Promise<number> {
  const header = await bytes(zip, entry.localHeaderOffset, entry.localHeaderOffset + 30)
  if (header.getUint32(0, true) !== LOCAL) throw new ZipError(`${entry.name} is damaged.`)
  return entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
}

/**
 * The entry's contents. A stored entry is a slice of the zip, so nothing is copied; a
 * deflated one is inflated in full, so prefer stored zips for video.
 */
export async function openZipEntry(zip: Blob, entry: ZipEntry): Promise<Blob> {
  if (entry.encrypted) throw new ZipError(`${entry.name} is password protected.`)
  const start = await dataStart(zip, entry)
  const raw = zip.slice(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method === 8) {
    const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Response(stream).blob()
  }
  throw new ZipError(`${entry.name} uses a compression this browser cannot read.`)
}
