import { LOS_Y } from './geometry'
import type {
  Diagram,
  DLine,
  DNote,
  DPlayer,
  FillStyle,
  LineType,
  Pt,
  Shape,
  TokenColor,
} from './types'

export const UNDO_CAP = 100

/** Which tool is live. Placement and draw tools stay live until another is picked. */
export type Tool =
  'select' | 'area' | 'lasso' | 'circle' | 'triangle' | 'text' | 'note' | `draw:${LineType}`

export function drawType(tool: Tool): LineType | null {
  return tool.startsWith('draw:') ? (tool.slice(5) as LineType) : null
}

export interface DiagramState {
  diagram: Diagram
  /** Ids of selected tokens, lines and notes. */
  selection: string[]
  tool: Tool
  /** The token whose colour popover is open. */
  popover: string | null
  past: Diagram[]
  future: Diagram[]
  dragging: boolean
}

/** A blank play: five linemen in a row on the line of scrimmage, four round and a square center. */
export function blankDiagram(): Diagram {
  const y = LOS_Y + 0.03
  const xs = [0.38, 0.44, 0.5, 0.56, 0.62]
  return {
    formation: 'Blank',
    players: xs.map((x, i) => ({
      id: `p${i + 1}`,
      shape: 'circle',
      color: 'white',
      fillStyle: 'solid',
      x,
      y,
      side: 'offense' as const,
      ...(i === 2 ? { square: true } : {}),
    })),
    lines: [],
    notes: [],
  }
}

export function createState(diagram: Diagram = blankDiagram()): DiagramState {
  return {
    diagram,
    selection: [],
    tool: 'select',
    popover: null,
    past: [],
    future: [],
    dragging: false,
  }
}

export type DiagramAction =
  | { type: 'load'; diagram: Diagram }
  /** Swap the whole diagram as one undoable edit, e.g. when a formation is picked. */
  | { type: 'replace'; diagram: Diagram }
  | { type: 'tool'; tool: Tool }
  | { type: 'select'; ids: string[]; additive?: boolean }
  | { type: 'addToken'; shape: Shape; at: Pt }
  | { type: 'addNote'; at: Pt }
  | { type: 'setStyle'; id: string; color?: TokenColor; fillStyle?: FillStyle }
  | { type: 'setText'; id: string; text: string }
  | { type: 'addLine'; playerId: string; lineType: LineType; to: Pt }
  | { type: 'moveBegin' }
  | { type: 'moveBy'; ids: string[]; dx: number; dy: number }
  | { type: 'moveEnd' }
  | { type: 'delete' }
  | { type: 'closePopover' }
  | { type: 'undo' }
  | { type: 'redo' }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function nextId(d: Diagram, prefix: 'p' | 'l' | 'n'): string {
  const all = [...d.players, ...d.lines, ...d.notes].map((item) => item.id)
  let n = 0
  for (const id of all) {
    if (id.startsWith(prefix)) n = Math.max(n, Number.parseInt(id.slice(1), 10) || 0)
  }
  return `${prefix}${n + 1}`
}

function push(past: Diagram[], d: Diagram): Diagram[] {
  const next = [...past, d]
  return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next
}

/** Apply a change to the diagram. Inside a drag the snapshot was already taken. */
function commit(s: DiagramState, diagram: Diagram, rest: Partial<DiagramState> = {}): DiagramState {
  if (diagram === s.diagram) return { ...s, ...rest }
  const past = s.dragging ? s.past : push(s.past, s.diagram)
  return { ...s, ...rest, diagram, past, future: [] }
}

/** Drop selection and popover ids that no longer exist. */
function tidy(s: DiagramState): DiagramState {
  const ids = new Set([
    ...s.diagram.players.map((p) => p.id),
    ...s.diagram.lines.map((l) => l.id),
    ...s.diagram.notes.map((n) => n.id),
  ])
  const selection = s.selection.filter((id) => ids.has(id))
  const popover = s.popover != null && ids.has(s.popover) ? s.popover : null
  return selection.length === s.selection.length && popover === s.popover
    ? s
    : { ...s, selection, popover }
}

function addToken(s: DiagramState, shape: Shape, at: Pt): DiagramState {
  const id = nextId(s.diagram, 'p')
  const player: DPlayer = {
    id,
    shape,
    color: 'white',
    fillStyle: 'solid',
    x: clamp01(at.x),
    y: clamp01(at.y),
    ...(shape === 'text' ? { label: 'Ab' } : {}),
  }
  return commit(
    s,
    { ...s.diagram, players: [...s.diagram.players, player] },
    // Circles and triangles ask for a colour right away; text just gets selected.
    { selection: [id], popover: shape === 'text' ? null : id },
  )
}

function setStyle(
  s: DiagramState,
  id: string,
  color?: TokenColor,
  fillStyle?: FillStyle,
): DiagramState {
  const player = s.diagram.players.find((p) => p.id === id)
  if (player == null || player.shape === 'text') return s
  const nextColor = color ?? player.color
  // Triangles are solid only.
  const nextFill: FillStyle =
    player.shape === 'triangle' ? 'solid' : (fillStyle ?? player.fillStyle)
  if (nextColor === player.color && nextFill === player.fillStyle) return s
  return commit(s, {
    ...s.diagram,
    players: s.diagram.players.map((p) =>
      p.id === id ? { ...p, color: nextColor, fillStyle: nextFill } : p,
    ),
    // A line is always its player's colour.
    lines: s.diagram.lines.map((l) => (l.playerId === id ? { ...l, color: nextColor } : l)),
  })
}

function setText(s: DiagramState, id: string, text: string): DiagramState {
  const player = s.diagram.players.find((p) => p.id === id)
  if (player != null) {
    const value = text.trim()
    if ((player.label ?? '') === value) return s
    return commit(s, {
      ...s.diagram,
      players: s.diagram.players.map((p) => {
        if (p.id !== id) return p
        const next: DPlayer = { ...p }
        if (value.length > 0 || p.shape === 'text') next.label = value
        else delete next.label
        return next
      }),
    })
  }
  const note = s.diagram.notes.find((n) => n.id === id)
  if (note == null || note.text === text) return s
  return commit(s, {
    ...s.diagram,
    notes: s.diagram.notes.map((n) => (n.id === id ? { ...n, text } : n)),
  })
}

function addLine(s: DiagramState, playerId: string, type: LineType, to: Pt): DiagramState {
  const player = s.diagram.players.find((p) => p.id === playerId)
  if (player == null || player.shape === 'text') return s
  const line: DLine = {
    id: nextId(s.diagram, 'l'),
    playerId,
    type,
    points: [{ x: clamp01(to.x), y: clamp01(to.y) }],
    color: player.color,
  }
  // One line per player: drawing again replaces it.
  const lines = [...s.diagram.lines.filter((l) => l.playerId !== playerId), line]
  return commit(s, { ...s.diagram, lines }, { selection: [line.id] })
}

function moveBy(s: DiagramState, ids: string[], dx: number, dy: number): DiagramState {
  const set = new Set(ids)
  const shift = (p: Pt): Pt => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) })
  const diagram: Diagram = {
    ...s.diagram,
    players: s.diagram.players.map((p) => (set.has(p.id) ? { ...p, ...shift(p) } : p)),
    notes: s.diagram.notes.map((n) => (set.has(n.id) ? { ...n, ...shift(n) } : n)),
    // A route travels with its player.
    lines: s.diagram.lines.map((l) =>
      set.has(l.playerId) || set.has(l.id) ? { ...l, points: l.points.map(shift) } : l,
    ),
  }
  return commit(s, diagram)
}

function remove(s: DiagramState): DiagramState {
  if (s.selection.length === 0) return s
  const gone = new Set(s.selection)
  const diagram: Diagram = {
    ...s.diagram,
    players: s.diagram.players.filter((p) => !gone.has(p.id)),
    // Removing a token takes its line with it.
    lines: s.diagram.lines.filter((l) => !gone.has(l.id) && !gone.has(l.playerId)),
    notes: s.diagram.notes.filter((n) => !gone.has(n.id)),
  }
  return tidy(commit(s, diagram, { selection: [] }))
}

/** Pure. Any action that changes nothing returns `s` itself. */
export function diagramReducer(s: DiagramState, a: DiagramAction): DiagramState {
  switch (a.type) {
    case 'load':
      return createState(a.diagram)
    case 'replace':
      return a.diagram === s.diagram
        ? s
        : tidy(commit(s, a.diagram, { selection: [], popover: null }))
    case 'tool':
      return a.tool === s.tool ? s : { ...s, tool: a.tool, popover: null }
    case 'select': {
      const ids = a.additive
        ? [
            ...s.selection.filter((id) => !a.ids.includes(id)),
            ...a.ids.filter((id) => !s.selection.includes(id)),
          ]
        : a.ids
      const only = ids.length === 1 ? ids[0] : undefined
      const token = only != null ? s.diagram.players.find((p) => p.id === only) : undefined
      // Picking one circle or triangle docks its colour popover beside it.
      return tidy({
        ...s,
        selection: ids,
        popover: token != null && token.shape !== 'text' ? token.id : null,
      })
    }
    case 'addToken':
      return addToken(s, a.shape, a.at)
    case 'addNote': {
      const note: DNote = {
        id: nextId(s.diagram, 'n'),
        x: clamp01(a.at.x),
        y: clamp01(a.at.y),
        text: 'Note',
      }
      return commit(
        s,
        { ...s.diagram, notes: [...s.diagram.notes, note] },
        { selection: [note.id], popover: null },
      )
    }
    case 'setStyle':
      return setStyle(s, a.id, a.color, a.fillStyle)
    case 'setText':
      return setText(s, a.id, a.text)
    case 'addLine':
      return addLine(s, a.playerId, a.lineType, a.to)
    case 'moveBegin':
      return s.dragging ? s : { ...s, dragging: true, past: push(s.past, s.diagram) }
    case 'moveBy':
      return s.dragging ? moveBy(s, a.ids, a.dx, a.dy) : s
    case 'moveEnd': {
      if (!s.dragging) return s
      const top = s.past[s.past.length - 1]
      // A drag that moved nothing leaves no undo entry.
      return { ...s, dragging: false, past: top === s.diagram ? s.past.slice(0, -1) : s.past }
    }
    case 'delete':
      return remove(s)
    case 'closePopover':
      return s.popover == null ? s : { ...s, popover: null }
    case 'undo': {
      const prev = s.past[s.past.length - 1]
      if (prev == null || s.dragging) return s
      return tidy({
        ...s,
        diagram: prev,
        past: s.past.slice(0, -1),
        future: [...s.future, s.diagram],
      })
    }
    case 'redo': {
      const next = s.future[s.future.length - 1]
      if (next == null || s.dragging) return s
      return tidy({
        ...s,
        diagram: next,
        past: push(s.past, s.diagram),
        future: s.future.slice(0, -1),
      })
    }
  }
}
