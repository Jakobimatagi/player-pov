import { useCallback, useEffect, useState } from 'react'
import { listRules, type PositionRule } from '../data/rules'
import { supabase } from '../data/supabase'

/** Position rules for a saved play. Empty for fixtures, drafts, or no backend. */
export function useRules(playId: string | null) {
  const [state, setState] = useState<{ key: string; rules: PositionRule[] } | null>(null)

  useEffect(() => {
    if (playId == null || supabase == null) return
    let dead = false
    listRules(playId)
      .then((rules) => {
        if (!dead) setState({ key: playId, rules })
      })
      .catch(() => {
        if (!dead) setState({ key: playId, rules: [] })
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
        return { key: playId, rules: rule == null ? rest : [...rest, rule] }
      })
    },
    [playId],
  )

  return { rules, replace }
}
