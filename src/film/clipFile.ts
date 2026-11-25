/**
 * What the import needs from a clip without decoding it: a fingerprint to recognise the
 * same file next time, and its length from the MP4 header. Reads at most a few MiB of a
 * clip; the video itself never leaves the browser.
 */

export const FINGERPRINT_EDGE_BYTES = 1024 * 1024

export interface ClipFingerprint {
  size: number
  /** Hex SHA-256 of the first and last MiB joined, or of the whole file when it is 2 MiB or less. */
  sha256: string
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fingerprintClip(file: Blob): Promise<ClipFingerprint> {
  const edge = FINGERPRINT_EDGE_BYTES
  const parts = file.size <= 2 * edge ? [file] : [file.slice(0, edge), file.slice(file.size - edge)]
  const data = await new Blob(parts).arrayBuffer()
  return { size: file.size, sha256: hex(await crypto.subtle.digest('SHA-256', data)) }
}

export const sameFingerprint = (a: ClipFingerprint, b: ClipFingerprint) =>
  a.size === b.size && a.sha256 === b.sha256

// ---------------------------------------------------------------------------------------
// MP4 / MOV length from the movie header (moov → mvhd). The top-level boxes are walked by
// reading only their 8 or 16 byte headers, so moov is found at the start or the end.

const MAX_MOOV_BYTES = 32 * 1024 * 1024

async function view(file: Blob, start: number, end: number): Promise<DataView | null> {
  if (start < 0 || end > file.size || end <= start) return null
  return new DataView(await file.slice(start, end).arrayBuffer())
}

function boxType(v: DataView, at: number): string {
  return String.fromCharCode(
    v.getUint8(at),
    v.getUint8(at + 1),
    v.getUint8(at + 2),
    v.getUint8(at + 3),
  )
}

function u64(v: DataView, at: number): number {
  return v.getUint32(at) * 2 ** 32 + v.getUint32(at + 4)
}

/** mvhd's duration in ms, given the box's payload (after its 8 byte header). */
function mvhdMs(v: DataView, at: number, end: number): number | null {
  const version = v.getUint8(at)
  const need = version === 1 ? 32 : 20
  if (at + need > end) return null
  const timescale = version === 1 ? v.getUint32(at + 20) : v.getUint32(at + 12)
  const duration = version === 1 ? u64(v, at + 24) : v.getUint32(at + 16)
  if (timescale === 0 || duration === 0 || duration === 0xffffffff) return null
  return Math.round((duration / timescale) * 1000)
}

/** The clip's length in ms, or null when the file is not an MP4/MOV or has no movie header. */
export async function readMp4DurationMs(file: Blob): Promise<number | null> {
  let at = 0
  for (let boxes = 0; at + 8 <= file.size && boxes < 1000; boxes += 1) {
    const head = await view(file, at, Math.min(at + 16, file.size))
    if (!head) return null
    let size = head.getUint32(0)
    const type = boxType(head, 4)
    let headerLength = 8
    if (size === 1) {
      if (head.byteLength < 16) return null
      size = u64(head, 8)
      headerLength = 16
    } else if (size === 0) {
      size = file.size - at
    }
    if (size < headerLength) return null

    if (type === 'moov') {
      if (size > MAX_MOOV_BYTES) return null
      const moov = await view(file, at, at + size)
      if (!moov) return null
      let p = headerLength
      while (p + 8 <= moov.byteLength) {
        const childSize = moov.getUint32(p)
        if (childSize < 8 || p + childSize > moov.byteLength) return null
        if (boxType(moov, p + 4) === 'mvhd') return mvhdMs(moov, p + 8, p + childSize)
        p += childSize
      }
      return null
    }
    at += size
  }
  return null
}
