import type { CompiledPlay } from '../play/types'

/** Three-letter names that are people, not position abbreviations. */
const TITLE = new Set(['sam'])

export interface WatchChoice {
  index: number
  id: string
  label: string
}

/**
 * Alignment word plus jersey. A single-word id is the label (`qb` → QB, `mike` → Mike).
 * Anything else uses `position`. A blank position leaves only the jersey.
 */
export function watchLabel(id: string, position: string, jersey: number): string {
  const name = alignmentName(id, position)
  const num = `#${jersey}`
  return name.length > 0 ? `${name} ${num}` : num
}

function alignmentName(id: string, position: string): string {
  if (/^[a-z]+$/.test(id) && (id.length > 3 || TITLE.has(id))) {
    return id.charAt(0).toUpperCase() + id.slice(1)
  }
  if (/^[a-z]{1,3}$/.test(id)) return id.toUpperCase()
  return position.trim()
}

function choicesFor(play: CompiledPlay, order: Uint8Array): WatchChoice[] {
  const list: WatchChoice[] = []
  for (let i = 0; i < order.length; i += 1) {
    const index = order[i] ?? 0
    const id = play.ids[index] ?? ''
    const position = play.positions[index] ?? ''
    const jersey = play.jerseys[index] ?? 0
    list.push({ index, id, label: watchLabel(id, position, jersey) })
  }
  return list
}

/** Offense, then defense, each in snap hop order. */
export function watchChoices(play: CompiledPlay): {
  offense: WatchChoice[]
  defense: WatchChoice[]
} {
  return {
    offense: choicesFor(play, play.hopOrder.offense),
    defense: choicesFor(play, play.hopOrder.defense),
  }
}
