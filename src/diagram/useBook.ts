import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import { loadRemoteScript, type RemoteScript } from '../data/diagrams'
import { listFolders } from '../data/plays'
import { supabase } from '../data/supabase'
import { DEMO_FOLDERS, honorDemoRoster } from '../playbook/archive'
import { effectiveFormation } from '../playbook/folders'

export interface BookInfo {
  name: string
  /** Base alignment key, inherited from the nearest folder above that has one. */
  formation: string | null
}

export interface BookState {
  book: BookInfo | null
  /** The script saved in the database, when there is one. */
  remote: RemoteScript | null
  /** True when scripts live in the database; false in the demo or with no playbook. */
  synced: boolean
  /** The playbook and its saved script have been looked up. */
  settled: boolean
  /** Why the lookup failed, when it did. */
  error: string | null
}

/** The playbook a diagram is drawn into: its name, base alignment and saved script. */
export function useBook(playbookId: string | null, roster: string | null): BookState {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const demo = supabase == null || honorDemoRoster(roster, true, import.meta.env.DEV)
  const synced = !demo && playbookId != null
  const [found, setFound] = useState<(Omit<BookState, 'synced'> & { forId: string | null }) | null>(
    null,
  )
  // A result only counts for the playbook it was fetched for.
  const state: Omit<BookState, 'synced'> =
    found != null && found.forId === playbookId
      ? found
      : { book: null, remote: null, settled: playbookId == null, error: null }

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (playbookId == null) return
    if (!demo && auth.teamId == null) return
    let dead = false
    void (async () => {
      try {
        const folders = demo ? DEMO_FOLDERS : (await listFolders(auth.teamId ?? '')).folders
        const folder = folders.find((item) => item.id === playbookId)
        const remote = demo ? null : await loadRemoteScript(playbookId)
        if (dead) return
        setFound({
          forId: playbookId,
          book:
            folder == null
              ? null
              : { name: folder.name, formation: effectiveFormation(folders, folder.id) },
          remote,
          settled: true,
          error: null,
        })
      } catch (error) {
        if (!dead) {
          setFound({
            forId: playbookId,
            book: null,
            remote: null,
            settled: true,
            error: error instanceof Error ? error.message : 'Could not load the playbook',
          })
        }
      }
    })()
    return () => {
      dead = true
    }
  }, [playbookId, demo, auth.teamId])

  return { ...state, synced }
}
