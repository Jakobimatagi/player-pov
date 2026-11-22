import starter from '../../fixtures/trips-flood.source.json'
import { compileChart } from '../editor/compileAdapter'
import { COVER_2_LOOK, COVER_3_LOOK } from '../play/cover2Look'
import { importPlayFile } from '../play/importPlayFile'
import { validatePlay } from '../play/load'
import { LookSourceSchema, PlaySourceSchema } from '../play/sourceSchema'
import type { LookSource, PlaySource } from '../play/sourceTypes'

export interface NewPlay {
  source: PlaySource
  look: LookSource
}

export type ParsedUpload = { ok: true; play: NewPlay } | { ok: false; error: string }

const BUILT_IN_LOOKS: readonly LookSource[] = [COVER_2_LOOK, COVER_3_LOOK]

function lookFor(id: string | undefined): LookSource {
  return BUILT_IN_LOOKS.find((look) => look.id === id) ?? COVER_2_LOOK
}

function compiles(play: NewPlay): string | null {
  const chart = compileChart(play.source, play.look)
  if (chart.play != null) return null
  const first = chart.errors[0]
  return first == null ? 'The play did not compile' : `${first.path}: ${first.message}`
}

function sourceFrom(data: unknown): PlaySource | null {
  const parsed = PlaySourceSchema.safeParse(data)
  return parsed.success ? (parsed.data as PlaySource) : null
}

/**
 * Reads an uploaded play file. Accepts a play source (`sourceVersion: 1`), a
 * `{ source, look }` pair, or a compiled play file like the viewer loads.
 */
export function parsePlayUpload(text: string, fallbackName: string): ParsedUpload {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not JSON' }
  }
  let play: NewPlay | null = null
  if (data != null && typeof data === 'object' && 'source' in data) {
    const pair = data as { source: unknown; look?: unknown }
    const source = sourceFrom(pair.source)
    const look = LookSourceSchema.safeParse(pair.look)
    if (source != null) {
      play = {
        source,
        look: look.success ? (look.data as LookSource) : lookFor(source.defaultLookId),
      }
    }
  } else if (data != null && typeof data === 'object' && 'sourceVersion' in data) {
    const source = sourceFrom(data)
    if (source == null) return { ok: false, error: 'That play source has missing or bad fields' }
    play = { source, look: lookFor(source.defaultLookId) }
  } else {
    const validated = validatePlay(data)
    if (validated.ok) play = importPlayFile(validated.play)
  }
  if (play == null) {
    return { ok: false, error: 'That file is not a play source or a play file' }
  }
  if (play.source.name.trim().length === 0) {
    play = { ...play, source: { ...play.source, name: fallbackName } }
  }
  const error = compiles(play)
  return error == null ? { ok: true, play } : { ok: false, error }
}

/** The file name without its extension, for a play that has no name of its own. */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/\.source$/, '')
  return base.trim().length > 0 ? base.trim() : 'Uploaded play'
}

/**
 * A named play that only lines up: the starter formation with every route
 * removed, against Cover 2. It is a placeholder to file until the editor lands.
 */
export function blankPlay(name: string): NewPlay {
  const base = sourceFrom(starter)
  if (base == null) throw new Error('starter play is invalid')
  const source: PlaySource = {
    ...base,
    name: name.trim(),
    players: base.players.map((player) => ({ ...player, legs: [] })),
    adjustments: [],
  }
  delete source.id
  delete source.description
  return { source, look: COVER_2_LOOK }
}
