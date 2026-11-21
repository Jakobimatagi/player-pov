import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import {
  addRosterPlayers,
  deleteRosterPlayer,
  listDepth,
  listRoster,
  mergeRosterPlayers,
  setDepth,
  updateRosterPlayer,
  type RosterPatch,
} from '../data/roster'
import { supabase } from '../data/supabase'
import { DEMO_DEPTH, DEMO_ROSTER } from './demoRoster'
import type { DepthMap, RosterPlayer } from './roster'

let demoSeq = 1000

/**
 * Roster and depth chart for the signed-in coach's team, or the demo roster with no
 * backend. Mutations update local state first and roll back if the save fails.
 */
export function useTeamRoster() {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const demo = supabase == null
  const teamId = snap.teamId
  const [players, setPlayers] = useState<RosterPlayer[]>(() => (demo ? DEMO_ROSTER : []))
  const [depth, setDepthMap] = useState<DepthMap>(() => (demo ? DEMO_DEPTH : {}))
  const [loadedKey, setLoadedKey] = useState<string | null>(demo ? 'demo' : null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (demo || teamId == null) return
    let dead = false
    Promise.all([listRoster(teamId), listDepth(teamId)])
      .then(([roster, chart]) => {
        if (dead) return
        setPlayers(roster)
        setDepthMap(chart)
        setLoadedKey(teamId)
      })
      .catch((err: unknown) => {
        if (dead) return
        setError(err instanceof Error ? err.message : 'Could not load the roster')
        setLoadedKey(teamId)
      })
    return () => {
      dead = true
    }
  }, [demo, teamId])

  const update = useCallback(
    async (id: string, patch: RosterPatch) => {
      let before: RosterPlayer | undefined
      setPlayers((rows) =>
        rows.map((row) => {
          if (row.id !== id) return row
          before = row
          return { ...row, ...patch }
        }),
      )
      if (demo) return
      try {
        await updateRosterPlayer(id, patch)
      } catch (err) {
        const prior = before
        if (prior != null) setPlayers((rows) => rows.map((row) => (row.id === id ? prior : row)))
        throw err
      }
    },
    [demo],
  )

  const add = useCallback(
    async (rows: (RosterPatch & { name: string })[]) => {
      if (demo) {
        const made = rows.map((row) => ({
          id: `demo-${(demoSeq += 1)}`,
          userId: null,
          jersey: null,
          position: null,
          altPositions: [],
          gradYear: null,
          heightIn: null,
          weightLb: null,
          notes: '',
          ...row,
        }))
        setPlayers((current) => [...current, ...made])
        return made
      }
      if (teamId == null) throw new Error('No team')
      const made = await addRosterPlayers(teamId, rows)
      setPlayers((current) => [...current, ...made])
      return made
    },
    [demo, teamId],
  )

  const dropFromDepth = (chart: DepthMap, id: string): DepthMap =>
    Object.fromEntries(
      Object.entries(chart).map(([slot, ids]) => [slot, ids.filter((x) => x !== id)]),
    )

  const remove = useCallback(
    async (id: string) => {
      if (!demo) await deleteRosterPlayer(id)
      setPlayers((rows) => rows.filter((row) => row.id !== id))
      setDepthMap((chart) => dropFromDepth(chart, id))
    },
    [demo],
  )

  const merge = useCallback(
    async (keepId: string, dropId: string) => {
      if (!demo) await mergeRosterPlayers(keepId, dropId)
      setPlayers((rows) => {
        const keep = rows.find((row) => row.id === keepId)
        const gone = rows.find((row) => row.id === dropId)
        if (keep == null || gone == null) return rows
        const merged: RosterPlayer = {
          ...keep,
          jersey: keep.jersey ?? gone.jersey,
          altPositions: keep.altPositions.length > 0 ? keep.altPositions : gone.altPositions,
          gradYear: keep.gradYear ?? gone.gradYear,
          heightIn: keep.heightIn ?? gone.heightIn,
          weightLb: keep.weightLb ?? gone.weightLb,
          notes: keep.notes !== '' ? keep.notes : gone.notes,
        }
        return rows
          .filter((row) => row.id !== dropId)
          .map((row) => (row.id === keepId ? merged : row))
      })
      setDepthMap((chart) =>
        Object.fromEntries(
          Object.entries(chart).map(([slot, ids]) => [
            slot,
            ids.includes(keepId)
              ? ids.filter((x) => x !== dropId)
              : ids.map((x) => (x === dropId ? keepId : x)),
          ]),
        ),
      )
    },
    [demo],
  )

  const saveDepth = useCallback(
    async (slot: string, ids: string[]) => {
      let before: string[] = []
      setDepthMap((chart) => {
        before = chart[slot] ?? []
        return { ...chart, [slot]: ids }
      })
      if (demo) return
      if (teamId == null) throw new Error('No team')
      try {
        await setDepth(teamId, slot, ids)
      } catch (err) {
        const prior = before
        setDepthMap((chart) => ({ ...chart, [slot]: prior }))
        throw err
      }
    },
    [demo, teamId],
  )

  return {
    snap,
    demo,
    loading: loadedKey == null || (!demo && loadedKey !== teamId),
    error,
    players,
    depth,
    update,
    add,
    remove,
    merge,
    saveDepth,
  }
}
