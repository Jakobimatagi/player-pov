import type { PlayLoadError } from '../play/types'

export interface ErrorGroup {
  id: string
  lines: string[]
}

/** Group path-tagged errors by player id and cap the visible lines at 50. */
export function formatLoadErrors(errors: readonly PlayLoadError[]): {
  groups: ErrorGroup[]
  more: number
} {
  const buckets = new Map<string, string[]>()
  for (const error of errors) {
    const id = error.playerId ?? 'play'
    const lines = buckets.get(id) ?? []
    lines.push(`${error.path}: ${error.message}`)
    buckets.set(id, lines)
  }
  const groups: ErrorGroup[] = []
  let shown = 0
  let hidden = 0
  for (const [id, lines] of buckets) {
    const room = 50 - shown
    if (room <= 0) {
      hidden += lines.length
      continue
    }
    const visible = lines.slice(0, room)
    hidden += lines.length - visible.length
    shown += visible.length
    if (visible.length > 0) groups.push({ id, lines: visible })
  }
  return { groups, more: hidden }
}
