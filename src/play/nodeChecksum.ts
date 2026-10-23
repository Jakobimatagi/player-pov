import { createHash } from 'node:crypto'
import { canonicalJson } from './canonical'

/** SHA-256 of canonical JSON. Node only. The browser uses checksumSource. */
export function playChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}
