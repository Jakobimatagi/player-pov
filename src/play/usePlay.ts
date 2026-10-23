import { useCallback, useEffect, useState } from 'react'
import { compileChart } from '../editor/compileAdapter'
import { fetchPlay, parseJson, playUrlFromSearch, SAMPLE_PLAY_URL } from './load'
import { collectWarnings, zodIssuesToErrors } from './schema'
import { LookSourceSchema, PlaySourceSchema } from './sourceSchema'
import type { CompiledPlay, PlayLoadError, PlayWarning } from './types'

/** Fixture ids until plays are stored. `version` is ignored until then. */
export const PLAY_FIXTURES: Record<string, string> = {
  'trips-right-flood-vs-cover2': '/plays/trips-right-vs-cover2.json',
}

export type PlayInput =
  | { kind: 'url'; url: string }
  | { kind: 'id'; playId: string; version?: number }
  | { kind: 'draft'; key: string }

export function playInputFromLocation(
  search: string,
  params: { playId?: string; draftKey?: string },
): PlayInput {
  if (params.draftKey != null && params.draftKey !== '')
    return { kind: 'draft', key: params.draftKey }
  if (params.playId != null && params.playId !== '') return { kind: 'id', playId: params.playId }
  return { kind: 'url', url: playUrlFromSearch(search) }
}

/** Fixture ids and draft keys. Own keys only, so the lookup cannot walk the prototype. */
const SAFE_ID = /^[a-z0-9-]{1,64}$/
const DRAFT_BYTE_CAP = 64 * 1024

function fixtureUrl(playId: string): string | undefined {
  if (!SAFE_ID.test(playId) || !Object.hasOwn(PLAY_FIXTURES, playId)) return undefined
  return PLAY_FIXTURES[playId]
}

function inputUrl(input: PlayInput): string {
  if (input.kind === 'url') return input.url
  if (input.kind === 'id') return fixtureUrl(input.playId) ?? `/watch/${input.playId}`
  return `/watch/draft/${input.key}`
}

type Loaded =
  | { ok: true; url: string; play: CompiledPlay; warnings: PlayWarning[] }
  | { ok: false; url: string; errors: PlayLoadError[] }

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
    if (url == null) {
      const missing = `/watch/${input.playId}`
      return {
        ok: false,
        url: missing,
        errors: [{ kind: 'network', path: missing, message: 'not found' }],
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
      return { ok: false, url, errors: chart.errors }
    }
    return { ok: true, url, play: chart.compiled, warnings: collectWarnings(chart.play) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'draft failed to compile'
    return { ok: false, url, errors: [{ kind: 'schema', path: url, message }] }
  }
}

export type PlayState =
  | { status: 'loading'; url: string }
  | { status: 'error'; url: string; errors: PlayLoadError[] }
  | { status: 'ready'; url: string; play: CompiledPlay; warnings: PlayWarning[] }

export function usePlayInput(input: PlayInput): PlayState & { retry: () => void } {
  const url = inputUrl(input)
  const kind = input.kind
  const requestUrl = input.kind === 'url' ? input.url : ''
  const playId = input.kind === 'id' ? input.playId : ''
  const version = input.kind === 'id' ? input.version : undefined
  const draftKey = input.kind === 'draft' ? input.key : ''
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PlayState>({ status: 'loading', url })

  useEffect(() => {
    let cancelled = false
    const current: PlayInput =
      kind === 'url'
        ? { kind: 'url', url: requestUrl }
        : kind === 'id'
          ? { kind: 'id', playId, ...(version != null ? { version } : {}) }
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
          })
        } else {
          setState({ status: 'error', url: result.url, errors: result.errors })
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
  }, [kind, requestUrl, playId, version, draftKey, attempt])

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
