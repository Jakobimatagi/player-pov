export type Team = 'offense' | 'defense'
export type Position =
  | 'QB'
  | 'RB'
  | 'FB'
  | 'WR'
  | 'TE'
  | 'LT'
  | 'LG'
  | 'C'
  | 'RG'
  | 'RT'
  | 'DE'
  | 'DT'
  | 'NT'
  | 'LB'
  | 'CB'
  | 'S'

export interface Waypoint {
  t: number
  x: number
  y: number
  face?: number
  interp?: 'smooth' | 'linear'
}

export interface PlayerTrack {
  id: string
  team: Team
  position: Position
  jersey: number
  role?: string
  waypoints: Waypoint[]
}

export interface PlayMeta {
  id: string
  name: string
  offenseFormation?: string
  defenseFront?: string
  coverage?: string
  description?: string
  lineOfScrimmageX: number
  ballY: number
  duration: number
  offenseDirection: '+x'
}

export type BallSegment =
  | { kind: 'carried'; t0: number; t1: number; carrier: string }
  | { kind: 'flight'; t0: number; t1: number; from: string; to: string; apex?: number }

export interface BallTrack {
  segments: BallSegment[]
}

export interface PlayFile {
  schemaVersion: 1
  meta: PlayMeta
  players: PlayerTrack[]
  ball: BallTrack
}

export interface PlayLoadError {
  kind: 'parse' | 'schema' | 'semantic' | 'network' | 'version'
  path: string
  message: string
  playerId?: string
}

export interface PlayWarning {
  path: string
  message: string
  playerId?: string
}
