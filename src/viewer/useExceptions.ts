import { useEffect, useState } from 'react'
import { loadChartedFacing } from '../data/looks'
import { supabase } from '../data/supabase'
import { listVariants, type Facing, type RuleVariant } from '../data/variants'

/**
 * A saved play's "vs" exceptions and the formation it was charted against, so the 3D
 * viewer's rule card shows the same answers as the play sheet. Empty without a backend.
 */
export function useExceptions(playId: string | null): {
  variants: RuleVariant[]
  facing: Facing | null
} {
  const [state, setState] = useState<{
    key: string
    variants: RuleVariant[]
    facing: Facing | null
  } | null>(null)

  useEffect(() => {
    if (playId == null || supabase == null) return
    let dead = false
    Promise.all([listVariants(playId), loadChartedFacing(playId)])
      .then(([variants, facing]) => {
        if (!dead) setState({ key: playId, variants, facing })
      })
      .catch(() => {
        // Without them the card falls back to the base rule, which is still correct.
        if (!dead) setState({ key: playId, variants: [], facing: null })
      })
    return () => {
      dead = true
    }
  }, [playId])

  if (state == null || state.key !== playId) return { variants: [], facing: null }
  return { variants: state.variants, facing: state.facing }
}
