export interface Pt {
  x: number
  y: number
}

/** Pointer samples closer than this many yards to the last kept one are dropped. */
export const MIN_STEP = 0.4
/** A drag shorter than this many yards is a click, not a freehand line. */
export const CLICK_YARDS = 1.5

export function pathLength(points: readonly Pt[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    if (a != null && b != null) total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

function farthest(points: readonly Pt[], from: number, to: number): { index: number; d: number } {
  const a = points[from]
  const b = points[to]
  let best = { index: -1, d: 0 }
  if (a == null || b == null) return best
  const ex = b.x - a.x
  const ey = b.y - a.y
  const len2 = ex * ex + ey * ey
  for (let i = from + 1; i < to; i += 1) {
    const p = points[i]
    if (p == null) continue
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0
    const d = Math.hypot(p.x - (a.x + t * ex), p.y - (a.y + t * ey))
    if (d > best.d) best = { index: i, d }
  }
  return best
}

function rdp(points: readonly Pt[], epsilon: number): Pt[] {
  const keep = new Set<number>([0, points.length - 1])
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const range = stack.pop()
    if (range == null) break
    const [from, to] = range
    const { index, d } = farthest(points, from, to)
    if (index >= 0 && d > epsilon) {
      keep.add(index)
      stack.push([from, index], [index, to])
    }
  }
  return points.filter((_, i) => keep.has(i))
}

/**
 * Turn a freehand stroke into corner points. `points[0]` is where the line starts and is
 * always kept. The result has at most `maxLegs` points after it: the tolerance grows until
 * it fits, so a long scribble still lands as a handful of legs.
 */
export function simplifyStroke(points: readonly Pt[], maxLegs: number, epsilon = 0.75): Pt[] {
  if (points.length <= 2 || maxLegs < 1)
    return points.slice(0, Math.min(points.length, 1 + Math.max(0, maxLegs)))
  let tolerance = epsilon
  let out = rdp(points, tolerance)
  while (out.length - 1 > maxLegs && tolerance < 200) {
    tolerance *= 1.5
    out = rdp(points, tolerance)
  }
  return out
}
