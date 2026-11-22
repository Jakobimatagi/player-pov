import { useCallback, useEffect, useState } from 'react'
import { compileChart } from '../editor/compileAdapter'
import { loadLook } from '../data/looks'
import { loadPlay } from '../data/plays'
import { supabase } from '../data/supabase'
import { compilePlay } from './compile'
import { readableCompileErrors } from './compileErrors'
import { lookParam, pickLook } from './lookChoice'
import { fetchPlay, parseJson, playUrlFromSearch, SAMPLE_PLAY_URL, validatePlay } from './load'
import { collectWarnings, zodIssuesToErrors } from './schema'
import { LookSourceSchema, PlaySourceSchema } from './sourceSchema'
import type { PlaySide } from './sourceTypes'
import type { CompiledPlay, PlayLoadError, PlayWarning } from './types'

/** Fixture ids until plays are stored. `version` is ignored until then. */
export const PLAY_FIXTURES: Record<string, string> = {
  'trips-right-flood-vs-cover2': '/plays/trips-right-vs-cover2.json',
}

export type PlayInput =
  | { kind: 'url'; url: string }
  /** `lookId` is the raw `?look=` value: which saved look to compile the play against. */
  | { kind: 'id'; playId: string; version?: number; lookId?: string }
  | { kind: 'draft'; key: string }

export function playInputFromLocation(
  search: string,
  params: { playId?: string; draftKey?: string },
): PlayInput {
  if (params.draftKey != null && params.draftKey !== '')
    return { kind: 'draft', key: params.draftKey }
  if (params.playId != null && params.playId !== '') {
    const lookId = lookParam(search)
    return lookId == null
      ? { kind: 'id', playId: params.playId }
      : { kind: 'id', playId: params.playId, lookId }
  }
  return { kind: 'url', url: playUrlFromSearch(search) }
}

/** Fixture ids and draft keys. Own keys only, so the lookup cannot walk the prototype. */
const SAFE_ID = /^[a-z0-9-]{1,64}$/
const DRAFT_BYTE_CAP = 64 * 1024

function fixtureUrl(playId: string): string | undefined {
  if (!SAFE_ID.test(playId) || !Object.hasOwn(PLAY_FIXTURES, playId)) return undefined
  return PLAY_FIXTURES[playId]
}

/** The viewer path for a saved (or unknown) play id, with the raw look param when given. */
function watchPath(playId: string, lookId?: string): string {
  return lookId == null ? `/watch/${playId}` : `/watch/${playId}?look=${encodeURIComponent(lookId)}`
}

function inputUrl(input: PlayInput): string {
  if (input.kind === 'url') return input.url
  if (input.kind === 'id') return fixtureUrl(input.playId) ?? watchPath(input.playId, input.lookId)
  return `/watch/draft/${input.key}`
}

/** Saved plays are uuids. RLS decides whether the caller may read one. */
const SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSavedPlayId(id: string | null): id is string {
  return id != null && SAVED_ID.test(id)
}

/** The look a play is being watched against, for the viewer's switcher. */
export interface WatchedLook {
  id: string | null
  name: string
  /** Saved plays only: what the switcher needs to list the other looks. */
  playSide?: PlaySide
  defaultLookId?: string | null
  teamId?: string
}

/** A play compiled against another look is a different play to the camera (fresh attach). */
function keyedToLook(play: CompiledPlay, lookId: string): CompiledPlay {
  return { ...play, meta: { ...play.meta, id: `${play.meta.id}@${lookId}` } }
}

export const LOOK_UNAVAILABLE =
  'This look isn’t available. It may have been deleted, or it isn’t in a package assigned to you.'

/**
 * A saved play against a saved look. No `?look=` (or the charted look's id) runs the
 * stored compiled play; any other look compiles the play's source against that look's
 * current version. A bad or unreadable look id is an error, never the charted look.
 */
async function loadSavedPlay(playId: string, version?: number, lookId?: string): Promise<Loaded> {
  const url = watchPath(playId, lookId)
  try {
    const saved = await loadPlay(playId, version)
    const pick = pickLook(lookId ?? null, saved.row.default_look_id)
    const context = {
      playSide: saved.row.side,
      defaultLookId: saved.row.default_look_id,
      teamId: saved.row.team_id,
    }
    if (pick.kind === 'invalid') {
      return {
        ok: false,
        url,
        heading: 'Couldn’t open this look',
        errors: [
          {
            kind: 'network',
            path: '?look=',
            playerId: 'Scout look',
            message: `“${pick.value}” is not a saved look id.`,
          },
        ],
      }
    }
    if (pick.kind === 'charted') {
      const validated = validatePlay(saved.compiled)
      if (!validated.ok) return { ok: false, url, errors: validated.errors }
      const look: WatchedLook = {
        id: saved.look?.id ?? null,
        name: saved.look?.source.name ?? 'Charted look',
        ...context,
      }
      return {
        ok: true,
        url,
        play: compilePlay(validated.play),
        warnings: validated.warnings,
        look,
      }
    }
    const look = await loadLook(pick.id)
    if (look == null) {
      return {
        ok: false,
        url,
        heading: 'Couldn’t open this look',
        errors: [
          { kind: 'network', path: '?look=', playerId: 'Scout look', message: LOOK_UNAVAILABLE },
        ],
      }
    }
    const source = { ...look.source, name: look.name }
    const chart = compileChart(saved.source, source)
    if (chart.compiled == null || chart.play == null) {
      return {
        ok: false,
        url,
        heading: `${saved.row.name} doesn’t compile against ${look.name}`,
        errors: readableCompileErrors(chart.errors, saved.source, source),
      }
    }
    return {
      ok: true,
      url,
      play: keyedToLook(chart.compiled, look.id),
      warnings: collectWarnings(chart.play),
      look: { id: look.id, name: look.name, ...context },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'load failed'
    return { ok: false, url, errors: [{ kind: 'network', path: url, message }] }
  }
}

type Loaded =
  | {
      ok: true
      url: string
      play: CompiledPlay
      warnings: PlayWarning[]
      look?: WatchedLook | null
    }
  | { ok: false; url: string; errors: PlayLoadError[]; heading?: string }

function prefixed(errors: PlayLoadError[], prefix: string): PlayLoadError[] {
  return errors.map((error) => ({
    ...error,
    path: error.path.length === 0 ? prefix : `${prefix}.${error.path}`,
  }))
}

export async function loadPlayInput(input: PlayInput): Promise<Loaded> {
  if (input.kind === 'url') return fetchPlay(input.url)
  if (input.kind === 'id') {
    const url = fixtureUrl(input.playId)
    if (url == null && supabase != null && SAVED_ID.test(input.playId)) {
      return loadSavedPlay(input.playId, input.version, input.lookId)
    }
    if (url == null) {
      const missing = watchPath(input.playId, input.lookId)
      return {
        ok: false,
        url: missing,
        errors: [{ kind: 'network', path: missing, message: 'not found' }],
      }
    }
    if (input.lookId != null) {
      // A demo fixture is already compiled against its one look; there is nothing to swap.
      return {
        ok: false,
        url,
        heading: 'Couldn’t open this look',
        errors: [
          {
            kind: 'network',
            path: '?look=',
            playerId: 'Scout look',
            message: 'This demo play only runs against its own look.',
          },
        ],
      }
    }
    return fetchPlay(url)
  }
  const url = `/watch/draft/${input.key}`
  if (!SAFE_ID.test(input.key)) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'network', path: url, message: 'not found' }],
    }
  }
  const raw = globalThis.sessionStorage?.getItem(`draft:${input.key}`) ?? null
  if (raw == null) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'network', path: url, message: 'not found' }],
    }
  }
  if (new TextEncoder().encode(raw).byteLength > DRAFT_BYTE_CAP) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'parse', path: url, message: 'draft is over 64KB' }],
    }
  }
  const parsed = parseJson(raw)
  if (!parsed.ok) {
    return { ok: false, url, errors: [{ kind: 'parse', path: url, message: parsed.message }] }
  }
  const record = parsed.value
  if (typeof record !== 'object' || record == null) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'schema', path: url, message: 'draft is missing source or look' }],
    }
  }
  const body = record as { source?: unknown; look?: unknown }
  const sourceParsed = PlaySourceSchema.safeParse(body.source)
  const lookParsed = LookSourceSchema.safeParse(body.look)
  if (!sourceParsed.success || !lookParsed.success) {
    return {
      ok: false,
      url,
      errors: [
        ...(sourceParsed.success
          ? []
          : prefixed(zodIssuesToErrors(sourceParsed.error, body.source), 'source')),
        ...(lookParsed.success
          ? []
          : prefixed(zodIssuesToErrors(lookParsed.error, body.look), 'look')),
      ],
    }
  }
  try {
    const chart = compileChart(sourceParsed.data, lookParsed.data)
    if (chart.compiled == null || chart.play == null) {
      return {
        ok: false,
        url,
        heading: 'This draft doesn’t compile yet',
        errors: readableCompileErrors(chart.errors, sourceParsed.data, lookParsed.data),
      }
    }
    return {
      ok: true,
      url,
      play: chart.compiled,
      warnings: collectWarnings(chart.play),
      look: { id: null, name: lookParsed.data.name },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'draft failed to compile'
    return { ok: false, url, errors: [{ kind: 'schema', path: url, message }] }
  }
}

export type PlayState =
  | { status: 'loading'; url: string }
  | { status: 'error'; url: string; errors: PlayLoadError[]; heading?: string }
  | {
      status: 'ready'
      url: string
      play: CompiledPlay
      warnings: PlayWarning[]
      look: WatchedLook | null
    }

export function usePlayInput(input: PlayInput): PlayState & { retry: () => void } {
  const url = inputUrl(input)
  const kind = input.kind
  const requestUrl = input.kind === 'url' ? input.url : ''
  const playId = input.kind === 'id' ? input.playId : ''
  const version = input.kind === 'id' ? input.version : undefined
  const lookId = input.kind === 'id' ? input.lookId : undefined
  const draftKey = input.kind === 'draft' ? input.key : ''
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PlayState>({ status: 'loading', url })

  useEffect(() => {
    let cancelled = false
    const current: PlayInput =
      kind === 'url'
        ? { kind: 'url', url: requestUrl }
        : kind === 'id'
          ? {
              kind: 'id',
              playId,
              ...(version != null ? { version } : {}),
              ...(lookId != null ? { lookId } : {}),
            }
          : { kind: 'draft', key: draftKey }
    void (async () => {
      try {
        const result = await loadPlayInput(current)
        if (cancelled) return
        if (result.ok) {
          for (const warning of result.warnings) console.warn(`${warning.path}: ${warning.message}`)
          setState({
            status: 'ready',
            url: result.url,
            play: result.play,
            warnings: result.warnings,
            look: result.look ?? null,
          })
        } else {
          setState({
            status: 'error',
            url: result.url,
            errors: result.errors,
            ...(result.heading != null ? { heading: result.heading } : {}),
          })
        }
      } catch (err) {
        if (cancelled) return
        const failed = inputUrl(current)
        const message = err instanceof Error ? err.message : 'load failed'
        setState({
          status: 'error',
          url: failed,
          errors: [{ kind: 'parse', path: failed, message }],
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kind, requestUrl, playId, version, lookId, draftKey, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading', url })
    setAttempt((n) => n + 1)
  }, [url])

  const visible = state.url === url ? state : { status: 'loading' as const, url }
  return { ...visible, retry }
}

export function usePlay(url: string = SAMPLE_PLAY_URL): PlayState & { retry: () => void } {
  return usePlayInput({ kind: 'url', url })
}
