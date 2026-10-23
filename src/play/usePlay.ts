import { useCallback, useEffect, useState } from 'react'
import { compileChart } from '../editor/compileAdapter'
import { fetchPlay, parseJson, playUrlFromSearch, SAMPLE_PLAY_URL } from './load'
import { collectWarnings } from './schema'
import type { LookSource, PlaySource } from './sourceTypes'
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

function inputUrl(input: PlayInput): string {
  if (input.kind === 'url') return input.url
  if (input.kind === 'id') return PLAY_FIXTURES[input.playId] ?? `/watch/${input.playId}`
  return `/watch/draft/${input.key}`
}

type Loaded =
  | { ok: true; url: string; play: CompiledPlay; warnings: PlayWarning[] }
  | { ok: false; url: string; errors: PlayLoadError[] }

function isDraft(value: unknown): value is { source: PlaySource; look: LookSource } {
  if (typeof value !== 'object' || value == null) return false
  const record = value as { source?: unknown; look?: unknown }
  if (typeof record.source !== 'object' || record.source == null) return false
  if (typeof record.look !== 'object' || record.look == null) return false
  const source = record.source as { sourceVersion?: unknown; players?: unknown }
  const look = record.look as { players?: unknown }
  return source.sourceVersion === 1 && Array.isArray(source.players) && Array.isArray(look.players)
}

export async function loadPlayInput(input: PlayInput): Promise<Loaded> {
  if (input.kind === 'url') return fetchPlay(input.url)
  if (input.kind === 'id') {
    const url = PLAY_FIXTURES[input.playId]
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
  const raw = globalThis.sessionStorage?.getItem(`draft:${input.key}`) ?? null
  if (raw == null) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'network', path: url, message: 'not found' }],
    }
  }
  const parsed = parseJson(raw)
  if (!parsed.ok) {
    return { ok: false, url, errors: [{ kind: 'parse', path: url, message: parsed.message }] }
  }
  if (!isDraft(parsed.value)) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'schema', path: url, message: 'draft is missing source or look' }],
    }
  }
  const chart = compileChart(parsed.value.source, parsed.value.look)
  if (chart.compiled == null || chart.play == null) {
    return { ok: false, url, errors: chart.errors }
  }
  return { ok: true, url, play: chart.compiled, warnings: collectWarnings(chart.play) }
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
    void loadPlayInput(current).then((result) => {
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
    })
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
