import { useEffect, useRef, useState } from 'react'
import { saveRemoteScript, ScriptConflictError } from '../data/diagrams'
import type { DiagramScript } from './script'
import { createSaver, type SaveStatus } from './saver'

/**
 * Autosaves the script to the database as it changes. Does nothing when `enabled` is false
 * (the demo, or a sandbox with no playbook).
 */
export function useRemoteSave(
  playbookId: string | null,
  enabled: boolean,
  script: DiagramScript,
  loaded: { version: number | null; script: DiagramScript | null },
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const loadedRef = useRef(loaded)
  const saver = useRef<ReturnType<typeof createSaver> | null>(null)

  useEffect(() => {
    if (!enabled || playbookId == null) return
    const made = createSaver({
      save: (next, expected) => saveRemoteScript(playbookId, next, expected),
      isConflict: (error) => error instanceof ScriptConflictError,
      onStatus: setStatus,
      loaded: loadedRef.current,
    })
    saver.current = made
    const onHide = () => {
      if (document.visibilityState === 'hidden') void made.flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      made.dispose()
      saver.current = null
    }
  }, [enabled, playbookId])

  useEffect(() => {
    saver.current?.update(script)
  }, [script])

  return status
}
