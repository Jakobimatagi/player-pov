import { fieldConfig, type FieldConfig } from '../field/fieldConfig'
import { alignOrigins } from '../play/compileSource'
import type { Leg, LookPlayer, LookSource, PlaySource, SourcePlayer } from '../play/sourceTypes'
import type { Position } from '../play/types'

/** = MAX_WAYPOINTS (12) - 1. Each leg adds one waypoint after the alignment point. */
export const MAX_LEGS = 11
/** Undo keeps at most this many snapshots. */
export const UNDO_CAP = 50
/** Snap grids in yards. The fine grid is held by a modifier or a 2-finger hold (C6). */
export const GRID = { coarse: 1, fine: 0.5 } as const

/** ours = PlaySource.players, theirs = LookSource.players. */
export type SideKey = 'ours' | 'theirs'
export interface PlayerRef {
  side: SideKey
  slot: string
}
/** leg -1 is the alignment point. */
export interface LegRef extends PlayerRef {
  leg: number
}
/** assign = block/man/zone tag on a leg via Leg.label. */
export type Tool = 'select' | 'route' | 'assign'
export type Snap = keyof typeof GRID | 'off'

export interface EditorIssue {
  ref: PlayerRef | LegRef | null
  message: string
}

export interface EditorState {
  playId: string | null
  /** For expected_version on save. */
  baseVersion: number | null
  name: string
  source: PlaySource
  look: LookSource
  lookId: string | null
  lookBaseVersion: number | null
  selection: PlayerRef | LegRef | null
  tool: Tool
  snap: Snap
  dirty: boolean
  /** True between beginDrag and endDrag, so a whole drag is one undo entry. */
  dragging: boolean
  past: EditorSnapshot[]
  future: EditorSnapshot[]
  /** Last compile errors mapped by sourceMap. */
  issues: EditorIssue[]
}

export type EditorSnapshot = Pick<EditorState, 'source' | 'look' | 'name'>

export interface EditorInit {
  source: PlaySource
  look: LookSource
  playId?: string | null
  baseVersion?: number | null
  lookId?: string | null
  lookBaseVersion?: number | null
}

export function createEditorState(init: EditorInit): EditorState {
  return {
    playId: init.playId ?? null,
    baseVersion: init.baseVersion ?? null,
    name: init.source.name,
    source: init.source,
    look: init.look,
    lookId: init.lookId ?? null,
    lookBaseVersion: init.lookBaseVersion ?? null,
    selection: null,
    tool: 'select',
    snap: 'coarse',
    dirty: false,
    dragging: false,
    past: [],
    future: [],
    issues: [],
  }
}

export function isLegRef(ref: PlayerRef | LegRef | null): ref is LegRef {
  return ref != null && 'leg' in ref
}

export function sameRef(a: PlayerRef | LegRef | null, b: PlayerRef | LegRef | null): boolean {
  if (a == null || b == null) return a === b
  if (a.side !== b.side || a.slot !== b.slot) return false
  const aLeg = isLegRef(a) ? a.leg : null
  const bLeg = isLegRef(b) ? b.leg : null
  return aLeg === bLeg
}

export function findPlayer(
  s: Pick<EditorState, 'source' | 'look'>,
  ref: PlayerRef,
): SourcePlayer | LookPlayer | undefined {
  const players: readonly (SourcePlayer | LookPlayer)[] =
    ref.side === 'ours' ? s.source.players : s.look.players
  return players.find((player) => player.slot === ref.slot)
}

/** Absolute yards: the alignment point, then one point per leg. */
export function legPoints(
  origin: { x: number; y: number },
  legs: readonly Leg[],
): { x: number; y: number }[] {
  const points = [{ x: origin.x, y: origin.y }]
  let x = origin.x
  let y = origin.y
  for (const leg of legs) {
    x += leg.to.dx
    y += leg.to.dy
    points.push({ x, y })
  }
  return points
}

export interface ChartPlayer {
  ref: PlayerRef
  position: Position
  jersey: number | undefined
  /** points[0] is the alignment; points[i + 1] is the end of legs[i]. Absolute yards. */
  points: { x: number; y: number }[]
  labels: (string | undefined)[]
}

export interface ChartLayout {
  los: number
  ballY: number
  players: ChartPlayer[]
}

/** All 22 players in absolute field yards, ours first. Look anchors resolve like the compiler. */
export function chartLayout(
  s: Pick<EditorState, 'source' | 'look'>,
  config: FieldConfig = fieldConfig(),
): ChartLayout {
  const origins = alignOrigins(s.source, s.look, config)
  const players: ChartPlayer[] = []
  const add = (side: SideKey, player: SourcePlayer | LookPlayer) => {
    const map = side === 'ours' ? origins.ours : origins.theirs
    const origin = map.get(player.slot) ?? { x: origins.los, y: origins.ballY }
    players.push({
      ref: { side, slot: player.slot },
      position: player.position,
      jersey: player.jersey,
      points: legPoints(origin, player.legs),
      labels: player.legs.map((leg) => leg.label),
    })
  }
  for (const player of s.source.players) add('ours', player)
  for (const player of s.look.players) add('theirs', player)
  return { los: origins.los, ballY: origins.ballY, players }
}
