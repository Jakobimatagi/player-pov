import { useCallback, useEffect, useState } from 'react'
import { listRules, type PositionRule } from '../data/rules'
import { supabase } from '../data/supabase'

/** Position rules for a saved play. Empty for fixtures, drafts, or no backend. */
export function useRules(playId: string | null) {
  const [state, setState] = useState<{
    key: string
    rules: PositionRule[]
    /** Bumps on each fetch, not on local saves, so open forms keep their state. */
    version: number
  } | null>(null)

  useEffect(() => {
    if (playId == null || supabase == null) return
    let dead = false
    listRules(playId)
      .then((rules) => {
        if (!dead) setState((prev) => ({ key: playId, rules, version: (prev?.version ?? 0) + 1 }))
      })
      .catch(() => {
        if (!dead)
          setState((prev) => ({ key: playId, rules: [], version: (prev?.version ?? 0) + 1 }))
      })
    return () => {
      dead = true
    }
  }, [playId])

  const rules = state != null && state.key === playId ? state.rules : []

  const replace = useCallback(
    (slot: string, rule: PositionRule | null) => {
      if (playId == null) return
      setState((current) => {
        const base = current != null && current.key === playId ? current.rules : []
        const rest = base.filter((item) => item.slot !== slot)
        return {
          key: playId,
          rules: rule == null ? rest : [...rest, rule],
          version: current?.version ?? 0,
        }
      })
    },
    [playId],
  )

  const version = state != null && state.key === playId ? state.version : 0
  return { rules, version, replace }
}
