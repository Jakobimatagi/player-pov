import { useEffect } from 'react'

const restoreFns = new Set<() => void>()

/** Register a callback that rebuilds GPU resources after webglcontextrestored. */
export function registerContextRestore(fn: () => void): () => void {
  restoreFns.add(fn)
  return () => {
    restoreFns.delete(fn)
  }
}

export function useContextRestore(fn: () => void): void {
  useEffect(() => registerContextRestore(fn), [fn])
}

export function runContextRestore(): void {
  for (const fn of restoreFns) fn()
}
