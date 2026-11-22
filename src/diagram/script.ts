import { z } from 'zod'
import { blankDiagram } from './model'
import { LINE_TYPES, TOKEN_COLORS, type Diagram } from './types'

/** A play in a practice script: a name and its diagram. */
export interface DiagramPlay {
  id: string
  name: string
  diagram: Diagram
}

/** Plays in the order they're run, and which one is open. */
export interface DiagramScript {
  plays: DiagramPlay[]
  index: number
}

const pt = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
const color = z.enum(TOKEN_COLORS as [string, ...string[]])

const DiagramSchema = z.object({
  formation: z.string(),
  players: z.array(
    z.object({
      id: z.string(),
      shape: z.enum(['circle', 'triangle', 'text']),
      color,
      fillStyle: z.enum(['solid', 'split']),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      label: z.string().optional(),
      square: z.boolean().optional(),
      side: z.enum(['offense', 'defense']).optional(),
    }),
  ),
  lines: z.array(
    z.object({
      id: z.string(),
      playerId: z.string(),
      type: z.enum(LINE_TYPES as unknown as [string, ...string[]]),
      points: z.array(pt).min(1),
      color,
    }),
  ),
  notes: z.array(z.object({ id: z.string(), x: z.number(), y: z.number(), text: z.string() })),
})

export const ScriptSchema = z.object({
  plays: z.array(z.object({ id: z.string(), name: z.string(), diagram: DiagramSchema })).min(1),
  index: z.number().int().min(0),
})

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function newPlay(id: string, name: string, base: Diagram = blankDiagram()): DiagramPlay {
  return { id, name, diagram: base }
}

/** A one-play script. `base` is the playbook's base alignment, when it has one. */
export function newScript(base?: Diagram): DiagramScript {
  return { plays: [newPlay('play-1', 'Play 1', base)], index: 0 }
}

export function goTo(script: DiagramScript, index: number): DiagramScript {
  const next = clamp(Math.trunc(index), 0, script.plays.length - 1)
  return next === script.index ? script : { ...script, index: next }
}

/** Write the open play's diagram back into the script. Returns the same script when unchanged. */
export function putDiagram(script: DiagramScript, diagram: Diagram): DiagramScript {
  const play = script.plays[script.index]
  if (play == null || play.diagram === diagram) return script
  const plays = script.plays.slice()
  plays[script.index] = { ...play, diagram }
  return { ...script, plays }
}

export function renameCurrent(script: DiagramScript, name: string): DiagramScript {
  const play = script.plays[script.index]
  if (play == null || play.name === name) return script
  const plays = script.plays.slice()
  plays[script.index] = { ...play, name }
  return { ...script, plays }
}

function freshId(script: DiagramScript): string {
  let n = 0
  for (const play of script.plays)
    n = Math.max(n, Number.parseInt(play.id.replace(/\D/g, ''), 10) || 0)
  return `play-${n + 1}`
}

/** A new play after the open one, now open, lined up in `base` (blank when none). */
export function addPlay(script: DiagramScript, base?: Diagram): DiagramScript {
  const at = script.index + 1
  const play = newPlay(freshId(script), `Play ${script.plays.length + 1}`, base)
  return { plays: [...script.plays.slice(0, at), play, ...script.plays.slice(at)], index: at }
}

/** A script keeps at least one play. */
export function removeAt(script: DiagramScript, index: number): DiagramScript {
  if (script.plays.length <= 1 || index < 0 || index >= script.plays.length) return script
  const plays = script.plays.filter((_, i) => i !== index)
  const open = index < script.index ? script.index - 1 : script.index
  return { plays, index: clamp(open, 0, plays.length - 1) }
}

export function positionLabel(script: DiagramScript): string {
  return `Play ${script.index + 1} of ${script.plays.length}`
}

export function storageKey(playbookId: string | null): string {
  return `pov:diagram-script:${playbookId ?? 'sandbox'}`
}

/** A script read from storage or the database, or null when it is not a valid one. */
export function parseScript(value: unknown): DiagramScript | null {
  const parsed = ScriptSchema.safeParse(value)
  if (!parsed.success) return null
  const script = parsed.data as DiagramScript
  return { ...script, index: clamp(script.index, 0, script.plays.length - 1) }
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** The saved script, or a fresh one when nothing is saved or it is unreadable. */
export function loadScript(key: string, store: Store | null): DiagramScript {
  try {
    const raw = store?.getItem(key)
    if (raw != null) {
      const script = parseScript(JSON.parse(raw))
      if (script != null) return script
    }
  } catch {
    // Blocked or corrupt storage: start fresh.
  }
  return newScript()
}

/** Every edit writes through. Returns false when the browser would not store it. */
export function saveScript(key: string, script: DiagramScript, store: Store | null): boolean {
  try {
    store?.setItem(key, JSON.stringify(script))
    return store != null
  } catch {
    return false
  }
}

/** The saved script, or null when nothing has been saved under this key. */
export function savedScript(key: string, store: Store | null): DiagramScript | null {
  try {
    if (store?.getItem(key) == null) return null
  } catch {
    return null
  }
  return loadScript(key, store)
}

export function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
