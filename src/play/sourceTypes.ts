import type { BallSegment, Position } from './types'

export type HashMark = 'L' | 'M' | 'R'
export type PlaySide = 'offense' | 'defense'
export type AnchorName = 'ball' | 'strong#1' | 'strong#2' | 'weak#1' | 'weak#2'

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
