import type { CompiledPlay } from '../play/types'

function read(arr: ArrayLike<number>, index: number): number {
  return arr[index] ?? 0
}

/** Next or previous player in the snap hop order. dir 1 is offense's right. Wraps. */
export function hopInTeam(play: CompiledPlay, index: number, dir: 1 | -1): number {
  const order = play.teams[index] === 'defense' ? play.hopOrder.defense : play.hopOrder.offense
  const slot = order.indexOf(index)
  if (slot < 0 || order.length === 0) return index
  const next = (slot + dir + order.length) % order.length
  return read(order, next)
}

/** Opponent closest to this player in the current field positions. No allocation. */
export function nearestOpponent(play: CompiledPlay, index: number, xy: Float32Array): number {
  const order = play.teams[index] === 'defense' ? play.hopOrder.offense : play.hopOrder.defense
  const x = read(xy, index * 2)
  const y = read(xy, index * 2 + 1)
  let best = index
  let bestD = Infinity
  for (let i = 0; i < order.length; i += 1) {
    const other = read(order, i)
    const dx = read(xy, other * 2) - x
    const dy = read(xy, other * 2 + 1) - y
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = other
    }
  }
  return best
}
