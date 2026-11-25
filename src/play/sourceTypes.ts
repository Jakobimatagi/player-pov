import type { TokenColor } from '../diagram/types'
import type { BallSegment, Position } from './types'

export type HashMark = 'L' | 'M' | 'R'
export type PlaySide = 'offense' | 'defense'
export type AnchorName = 'ball' | 'strong#1' | 'strong#2' | 'weak#1' | 'weak#2'
/** Anchors for our own defenders: the look's anchors, plus the ball set to the strength. */
export type DefenderAnchor = AnchorName | 'strong' | 'weak'

export interface Leg {
  to: { dx: number; dy: number }
  dur?: number
  speed?: number
  interp?: 'smooth' | 'linear'
  face?: number
  label?: string
}

export interface SourcePlayer {
  slot: string
  position: Position
  jersey?: number
  role?: string
  face?: number
  /** The player's colour on the play card. Routes in 3D are drawn in it. */
  color?: TokenColor
  /**
   * Defense plays only: line up relative to one of the offense's receivers, or to the
   * ball set to the strength (`strong` / `weak`), instead of fixed yards, so one call
   * re-aligns against every formation. With an anchor other than `ball`, `align.dy`
   * and every leg's `dy` mean yards *outside* (toward that side's sideline), so the
   * same call works whichever way the offense sets its strength.
   */
  anchor?: DefenderAnchor
  align: { dx: number; dy: number }
  legs: Leg[]
}

export interface Adjustment {
  when: { coverage?: string; front?: string; lookIds?: string[] }
  overrides: { slot: string; legs: Leg[] }[]
}

export interface SourceBall {
  snap: 'shotgun' | 'under-center'
  segments: BallSegment[]
}

export interface PlaySource {
  sourceVersion: 1
  id?: string
  name: string
  side: PlaySide
  formation?: string
  description?: string
  ballSpot: { yardLine: number; hash: HashMark }
  duration: number
  players: SourcePlayer[]
  defaultLookId?: string
  ball: SourceBall
  adjustments: Adjustment[]
}

export type LookAlign = { dx: number; dy: number } | { anchor: AnchorName; dx: number; dy: number }

export interface LookPlayer {
  slot: string
  position: Position
  jersey?: number
  role?: string
  face?: number
  color?: TokenColor
  align: LookAlign
  legs: Leg[]
}

export interface LookSource {
  id: string
  name: string
  side: PlaySide
  front?: string
  coverage?: string
  players: LookPlayer[]
}

export interface SourceMapEntry {
  compiled: string
  source: string
}
