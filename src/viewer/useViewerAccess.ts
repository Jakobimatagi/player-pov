import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAuthSnap, subscribeAuth } from '../auth/session'
import type { StaffSide, TeamRole } from '../data/database.types'
import { loadMySlot } from '../data/slots'
import { supabase } from '../data/supabase'
import { viewerAccess, type ViewerAccess } from './access'

/** Loads the player's slot for a saved play and resolves what the viewer may watch. */
export function useViewerAccess(
  playId: string | null,
  ids: readonly string[] | null,
): ViewerAccess & { teamId: string | null; role: TeamRole | null; side: StaffSide | null } {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const userId = snap.session?.user.id ?? null
  const isPlayer = snap.role === 'player'
  const [slot, setSlot] = useState<{ key: string; value: string | null } | null>(null)
  const key = `${playId ?? ''}:${userId ?? ''}`

  useEffect(() => {
    if (!isPlayer || playId == null || userId == null || supabase == null) return
    let dead = false
    loadMySlot(playId, userId)
      .then((value) => {
        if (!dead) setSlot({ key, value })
      })
      .catch(() => {
        if (!dead) setSlot({ key, value: null })
      })
    return () => {
      dead = true
    }
  }, [isPlayer, playId, userId, key])

  const loaded = slot?.key === key
  const access =
    ids == null
      ? ({ kind: 'loading' } as const)
      : viewerAccess({
          backend: supabase != null,
          savedPlay: playId != null,
          role: snap.role,
          slotLoaded: loaded,
          slot: loaded ? (slot?.value ?? null) : null,
          ids,
        })
  return { ...access, teamId: snap.teamId, role: snap.role, side: snap.side }
}
