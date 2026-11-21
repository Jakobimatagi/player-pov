import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAuthSnap, subscribeAuth } from '../auth/session'
import type { StaffSide, TeamRole } from '../data/database.types'
import { loadMySlot } from '../data/slots'
import { supabase } from '../data/supabase'
import { isSavedPlayId } from '../play/usePlay'
import { viewerAccess, type ViewerAccess } from './access'

/** Loads the player's slot for a saved play and resolves what the viewer may watch. */
export function useViewerAccess(
  playId: string | null,
  ids: readonly string[] | null,
): ViewerAccess & {
  teamId: string | null
  role: TeamRole | null
  side: StaffSide | null
  retry: () => void
} {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const userId = snap.session?.user.id ?? null
  const isPlayer = snap.role === 'player'
  const saved = isSavedPlayId(playId)
  const [attempt, setAttempt] = useState(0)
  const [slot, setSlot] = useState<{ key: string; value: string | null; failed: boolean } | null>(
    null,
  )
  const key = `${playId ?? ''}:${userId ?? ''}:${attempt}`

  useEffect(() => {
    if (!isPlayer || !saved || playId == null || userId == null || supabase == null) return
    let dead = false
    loadMySlot(playId, userId)
      .then((value) => {
        if (!dead) setSlot({ key, value, failed: false })
      })
      .catch(() => {
        if (!dead) setSlot({ key, value: null, failed: true })
      })
    return () => {
      dead = true
    }
  }, [isPlayer, saved, playId, userId, key])

  const loaded = slot?.key === key
  const access =
    ids == null
      ? ({ kind: 'loading' } as const)
      : viewerAccess({
          backend: supabase != null,
          savedPlay: saved,
          role: snap.role,
          membershipError: snap.membershipError,
          slotError: loaded && slot?.failed === true,
          slotLoaded: loaded,
          slot: loaded ? (slot?.value ?? null) : null,
          ids,
        })
  return {
    ...access,
    teamId: snap.teamId,
    role: snap.role,
    side: snap.side,
    retry: () => setAttempt((n) => n + 1),
  }
}
