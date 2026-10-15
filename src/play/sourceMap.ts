import type { SourceMapEntry } from './sourceTypes'

/** Map a compiled PlayFile path back to the coach's source path. */
export function mapCompiledPath(entries: readonly SourceMapEntry[], compiled: string): string {
  const exact = entries.find((entry) => entry.compiled === compiled)
  if (exact) return exact.source
  const prefix = entries.find(
    (entry) =>
      compiled.startsWith(`${entry.compiled}.`) || compiled.startsWith(`${entry.compiled}[`),
  )
  return prefix?.source ?? compiled
}
