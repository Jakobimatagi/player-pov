import { useEffect, useState } from 'react'
import { startAuth, subscribeAuth, getAuthSnap } from '../auth/session'
import { listFolders } from '../data/plays'
import { supabase } from '../data/supabase'
import { DEMO_FOLDERS, honorDemoRoster } from '../playbook/archive'
import { effectiveFormation } from '../playbook/folders'
import { useSyncExternalStore } from 'react'

export interface BookInfo {
  name: string
  /** Base alignment key, inherited from the nearest folder above that has one. */
  formation: string | null
}

/** The playbook a diagram is being drawn into: its name and base alignment. */
export function useBook(
  playbookId: string | null,
  roster: string | null,
): { book: BookInfo | null; settled: boolean } {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const demo = supabase == null || honorDemoRoster(roster, true, import.meta.env.DEV)
  const [book, setBook] = useState<BookInfo | null>(null)
  const [settled, setSettled] = useState(playbookId == null)

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
        if (dead) return
        setBook(
          folder == null
            ? null
            : { name: folder.name, formation: effectiveFormation(folders, folder.id) },
        )
      } catch {
        if (!dead) setBook(null)
      } finally {
        if (!dead) setSettled(true)
      }
    })()
    return () => {
      dead = true
    }
  }, [playbookId, demo, auth.teamId])

  return { book, settled }
}
