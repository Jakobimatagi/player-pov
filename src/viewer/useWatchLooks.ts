import { useEffect, useState } from 'react'
import { listWatchLooks } from '../data/looks'
import { supabase } from '../data/supabase'
import type { LookOption } from '../play/lookChoice'
import type { PlaySide } from '../play/sourceTypes'

/**
 * The looks a saved play can be watched against, for the play sheet's picker and the
 * viewer's switcher. Empty until loaded, with no backend, or when the list can't be read
 * (the play still opens against its charted look).
 */
export function useWatchLooks(input: {
  teamId: string | null
  playSide: PlaySide | null
  defaultLookId: string | null
}): { looks: LookOption[]; loaded: boolean } {
  const { teamId, playSide, defaultLookId } = input
  const key = `${teamId ?? ''}:${playSide ?? ''}:${defaultLookId ?? ''}`
  const [state, setState] = useState<{ key: string; looks: LookOption[] } | null>(null)

  useEffect(() => {
    if (supabase == null || teamId == null || playSide == null) return
    let dead = false
    listWatchLooks({ teamId, playSide, defaultLookId })
      .then((looks) => {
        if (!dead) setState({ key, looks })
      })
      .catch(() => {
        if (!dead) setState({ key, looks: [] })
      })
    return () => {
      dead = true
    }
  }, [key, teamId, playSide, defaultLookId])

  return state?.key === key ? { looks: state.looks, loaded: true } : { looks: [], loaded: false }
}
