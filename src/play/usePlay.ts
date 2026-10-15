import { useCallback, useEffect, useState } from 'react'
import { fetchPlay, SAMPLE_PLAY_URL } from './load'
import type { CompiledPlay, PlayLoadError, PlayWarning } from './types'

export type PlayState =
  | { status: 'loading'; url: string }
  | { status: 'error'; url: string; errors: PlayLoadError[] }
  | { status: 'ready'; url: string; play: CompiledPlay; warnings: PlayWarning[] }

export function usePlay(url: string = SAMPLE_PLAY_URL): PlayState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PlayState>({ status: 'loading', url })

  useEffect(() => {
    let cancelled = false
    void fetchPlay(url).then((result) => {
      if (cancelled) return
      if (result.ok) {
        for (const warning of result.warnings) console.warn(`${warning.path}: ${warning.message}`)
        setState({ status: 'ready', url, play: result.play, warnings: result.warnings })
      } else {
        setState({ status: 'error', url, errors: result.errors })
      }
    })
    return () => {
      cancelled = true
    }
  }, [url, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading', url })
    setAttempt((n) => n + 1)
  }, [url])

  const visible = state.url === url ? state : { status: 'loading' as const, url }
  return { ...visible, retry }
}
