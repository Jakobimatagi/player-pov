import type { PlaySource } from '../play/sourceTypes'

/**
 * A practice script: plays in the order they're run. Pure helpers over an array, so the
 * page can keep `plays` and `index` in plain state. Every helper returns the new pair and
 * leaves its input alone.
 */
export interface Script {
  plays: PlaySource[]
  index: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function goTo(script: Script, index: number): Script {
  const next = clamp(Math.trunc(index), 0, script.plays.length - 1)
  return next === script.index ? script : { ...script, index: next }
}

/** Write the play being edited back into its slot. */
export function putCurrent(script: Script, source: PlaySource): Script {
  if (script.plays[script.index] === source) return script
  const plays = script.plays.slice()
  plays[script.index] = source
  return { ...script, plays }
}

/** Same players and alignments, no routes: the start of the next play in a script. */
export function blankPlay(from: PlaySource, name: string): PlaySource {
  const out: PlaySource = { ...from, name }
  delete out.id
  return {
    ...out,
    players: from.players.map((player) => ({ ...player, legs: [] })),
    adjustments: [],
  }
}

export function copyPlay(from: PlaySource): PlaySource {
  const out: PlaySource = { ...from, name: `${from.name} copy` }
  delete out.id
  return out
}

/** Insert after the current play and move to it. */
export function insertAfter(script: Script, play: PlaySource): Script {
  const at = script.index + 1
  const plays = [...script.plays.slice(0, at), play, ...script.plays.slice(at)]
  return { plays, index: at }
}

/** A script always keeps at least one play. */
export function removeAt(script: Script, index: number): Script {
  if (script.plays.length <= 1 || index < 0 || index >= script.plays.length) return script
  const plays = script.plays.filter((_, i) => i !== index)
  const current = index < script.index ? script.index - 1 : script.index
  return { plays, index: clamp(current, 0, plays.length - 1) }
}

/** Swap a play with its neighbour. The selection follows the play that was current. */
export function move(script: Script, index: number, delta: -1 | 1): Script {
  const to = index + delta
  if (index < 0 || to < 0 || index >= script.plays.length || to >= script.plays.length) {
    return script
  }
  const plays = script.plays.slice()
  const a = plays[index]
  const b = plays[to]
  if (a == null || b == null) return script
  plays[index] = b
  plays[to] = a
  const current = script.index === index ? to : script.index === to ? index : script.index
  return { plays, index: current }
}

/** "Play 2 of 5". */
export function positionLabel(script: Script): string {
  return `Play ${script.index + 1} of ${script.plays.length}`
}
