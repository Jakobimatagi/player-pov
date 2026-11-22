import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import { loadRemoteScript, type RemoteScript } from '../data/diagrams'
import { listFolders } from '../data/plays'
import { supabase } from '../data/supabase'
import { DEMO_FOLDERS, honorDemoRoster } from '../playbook/archive'
import { effectiveFormation } from '../playbook/folders'
import { getFormationTemplate } from '../data/formationTemplates'
import { DEMO_TEMPLATES } from './templateStore'
import { templateIdOf, type FormationTemplate } from './templates'

export interface BookInfo {
  name: string
  /** Base alignment key, inherited from the nearest folder above that has one. */
  formation: string | null
  /** The team template that `formation` names, when it is one (`tpl:<id>`). */
  templates: FormationTemplate[]
}

/**
 * The template a base alignment points at, archived or not, so a book keeps its alignment
 * after the template leaves the pickers. Empty for a built-in key, or when it can't be read
 * (the play then starts from the blank line).
 */
async function bookTemplates(
  formation: string | null,
  demo: boolean,
): Promise<FormationTemplate[]> {
  const id = templateIdOf(formation)
  if (id == null) return []
  try {
    if (demo) return (await DEMO_TEMPLATES.list()).filter((t) => t.id === id)
    const template = await getFormationTemplate(id)
    return template == null ? [] : [template]
  } catch {
    return []
  }
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
        const formation = folder == null ? null : effectiveFormation(folders, folder.id)
        const templates = await bookTemplates(formation, demo)
        if (dead) return
        setFound({
          forId: playbookId,
          book: folder == null ? null : { name: folder.name, formation, templates },
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
