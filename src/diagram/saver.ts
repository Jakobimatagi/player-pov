import type { DiagramScript } from './script'

export type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict'

/** Wait this long after the last edit before writing, so a drag is one save. */
export const SAVE_DELAY_MS = 700
export const RETRY_MS = 5000

export interface SaverOptions {
  /** Writes the script and returns the new version. Rejects with `isConflict` errors. */
  save: (script: DiagramScript, expectedVersion: number | null) => Promise<number>
  isConflict: (error: unknown) => boolean
  onStatus: (status: SaveStatus) => void
  /** What the database holds now; null means nothing known to be there. */
  loaded: { version: number | null; script: DiagramScript | null }
}

/**
 * Debounced autosave. One save runs at a time; edits made during a save go out right after it,
 * a failed save retries, and a conflict stops everything rather than overwrite the other coach.
 */
export function createSaver(options: SaverOptions) {
  let synced = options.loaded.script
  let version = options.loaded.version
  let latest: DiagramScript | null = null
  let busy = false
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function clear() {
    if (timer != null) clearTimeout(timer)
    timer = null
  }

  async function flush(): Promise<void> {
    clear()
    if (busy || stopped || latest == null || latest === synced) return
    const sending = latest
    busy = true
    options.onStatus('saving')
    try {
      version = await options.save(sending, version)
      synced = sending
      busy = false
      if (latest !== sending) await flush()
      else options.onStatus('saved')
    } catch (error) {
      busy = false
      if (options.isConflict(error)) {
        stopped = true
        options.onStatus('conflict')
      } else {
        options.onStatus('error')
        timer = setTimeout(() => void flush(), RETRY_MS)
      }
    }
  }

  return {
    /** Call on every edit with the whole script. */
    update(script: DiagramScript) {
      latest = script
      if (stopped || script === synced) return
      clear()
      timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    /** Write now, for when the page is going away. */
    flush,
    dispose: clear,
  }
}
