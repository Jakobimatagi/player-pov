import { useEffect, useState } from 'react'
import { capDpr, DPR_MAX } from './dpr'

/**
 * Effective DPR = min(devicePixelRatio, cap), never above 1.25.
 * Re-arms a resolution media query after each change (§8a.4).
 */
export function useCappedDpr(cap: number = DPR_MAX): number {
  const [dpr, setDpr] = useState(() => capDpr(window.devicePixelRatio, cap))

  useEffect(() => {
    let query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)

    const arm = () => {
      setDpr(capDpr(window.devicePixelRatio, cap))
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      query.addEventListener('change', onChange)
    }

    const onChange = () => {
      query.removeEventListener('change', onChange)
      arm()
    }

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [cap])

  return dpr
}
