import { compilePlay } from '../play/compile'
import { compileSource } from '../play/compileSource'
import { canonicalJson } from '../play/canonical'
import { validatePlay } from '../play/load'
import { mapCompiledPath } from '../play/sourceMap'
import type { LookSource, PlaySource } from '../play/sourceTypes'
import type { CompiledPlay, PlayFile, PlayLoadError } from '../play/types'

export type SideKey = 'ours' | 'theirs'

export interface PlayerRef {
  side: SideKey
  slot: string
}

export interface LegRef extends PlayerRef {
  leg: number
}

export interface EditorIssue {
  ref: PlayerRef | LegRef | null
  message: string
}

export interface ChartCompile {
  play: PlayFile | null
  compiled: CompiledPlay | null
  errors: PlayLoadError[]
  issues: EditorIssue[]
}

const OURS = /^players\[([a-z][a-z0-9_]*)\](?:\.legs\[(\d+)\])?/
const THEIRS = /^look\.players\[([a-z][a-z0-9_]*)\](?:\.legs\[(\d+)\])?/

function issueFrom(path: string, message: string): EditorIssue {
  const ours = OURS.exec(path)
  const theirs = ours == null ? THEIRS.exec(path) : null
  const hit = ours ?? theirs
  if (hit == null) return { ref: null, message }
  const slot = hit[1] ?? ''
  const side: SideKey = ours != null ? 'ours' : 'theirs'
  const leg = hit[2]
  if (leg == null) return { ref: { side, slot }, message }
  return { ref: { side, slot, leg: Number(leg) }, message }
}

/** compileSource, then schema validate, then the runtime play. No checksum. */
export function compileChart(source: PlaySource, look: LookSource): ChartCompile {
  const result = compileSource(source, look)
  const validated = validatePlay(result.play)
  const errors: PlayLoadError[] = result.errors.map((error) => ({
    ...error,
    path: mapCompiledPath(result.sourceMap, error.path),
  }))
  if (!validated.ok) {
    for (const error of validated.errors) {
      errors.push({
        ...error,
        path: mapCompiledPath(result.sourceMap, error.path),
      })
    }
  }
  const issues = errors.map((error) => issueFrom(error.path, error.message))
  if (errors.length > 0 || !validated.ok) {
    return { play: null, compiled: null, errors, issues }
  }
  return {
    play: validated.play,
    compiled: compilePlay(validated.play),
    errors: [],
    issues: [],
  }
}

/** WebCrypto SHA-256 of canonical JSON. Matches node playChecksum. */
export async function checksumSource(source: PlaySource | LookSource): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(source))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  let hex = ''
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0')
  return hex
}
