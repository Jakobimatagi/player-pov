import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthSnap } from '../auth/session'
import {
  addDepthNote,
  deleteDepthNote,
  listTeamDepthNotes,
  updateDepthNote,
  type NoteDraft,
} from '../data/depthNotes'
import { DEMO_COACH_ID, DEMO_NOTES } from './demoDepthNotes'
import { notesByPlayer, type DepthNote } from './depthNotes'

let demoSeq = 100

/** Depth chart notes for the coach's team (or demo notes with no backend). */
export function useDepthNotes(snap: AuthSnap, demo: boolean) {
  const teamId = snap.teamId
  const [notes, setNotes] = useState<DepthNote[]>(() => (demo ? DEMO_NOTES : []))
  const [error, setError] = useState<string | null>(null)
  const userId = demo ? DEMO_COACH_ID : (snap.session?.user.id ?? null)
  const headCoach = demo || snap.role === 'head_coach'
  const meta = snap.session?.user.user_metadata as { display_name?: unknown } | undefined
  const myName = demo
    ? 'Coach Reyes'
    : typeof meta?.display_name === 'string' && meta.display_name.trim() !== ''
      ? meta.display_name.trim()
      : (snap.session?.user.email ?? 'You')

  useEffect(() => {
    if (demo || teamId == null) return
    let dead = false
    listTeamDepthNotes(teamId)
      .then((rows) => {
        if (!dead) setNotes(rows)
      })
      .catch((err: unknown) => {
        if (!dead) setError(err instanceof Error ? err.message : 'Could not load notes')
      })
    return () => {
      dead = true
    }
  }, [demo, teamId])

  const byPlayer = useMemo(() => notesByPlayer(notes), [notes])

  const add = useCallback(
    async (rosterPlayerId: string, draft: NoteDraft) => {
      if (demo) {
        const now = new Date().toISOString()
        const made: DepthNote = {
          id: `demo-note-${(demoSeq += 1)}`,
          rosterPlayerId,
          ...draft,
          sharedAt: draft.shared ? now : null,
          createdBy: DEMO_COACH_ID,
          authorName: myName,
          createdAt: now,
          updatedAt: now,
        }
        setNotes((rows) => [...rows, made])
        return
      }
      if (teamId == null) throw new Error('No team')
      const made = await addDepthNote(teamId, rosterPlayerId, draft, myName)
      setNotes((rows) => [...rows, made])
    },
    [demo, teamId, myName],
  )

  const update = useCallback(
    async (id: string, patch: Partial<NoteDraft>) => {
      if (demo) {
        const now = new Date().toISOString()
        setNotes((rows) =>
          rows.map((row) => {
            if (row.id !== id) return row
            const next = { ...row, ...patch, updatedAt: now }
            const reshare =
              next.shared && (!row.shared || (patch.body != null && patch.body !== row.body))
            return { ...next, sharedAt: next.shared ? (reshare ? now : row.sharedAt) : null }
          }),
        )
        return
      }
      const saved = await updateDepthNote(id, patch)
      setNotes((rows) => rows.map((row) => (row.id === id ? { ...row, ...saved } : row)))
    },
    [demo],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!demo) await deleteDepthNote(id)
      setNotes((rows) => rows.filter((row) => row.id !== id))
    },
    [demo],
  )

  return { notes, byPlayer, error, me: { userId, headCoach }, add, update, remove }
}

export type DepthNotesApi = ReturnType<typeof useDepthNotes>
