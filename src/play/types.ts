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

/** Runtime form. Built once. Only facingState and segmentCursor change during playback. */
export interface CompiledPlay {
  meta: PlayMeta
  count: number
  ids: readonly string[]
  teams: readonly Team[]
  jerseys: Uint8Array
  positions: readonly Position[]
  wpStart: Uint16Array
  wpT: Float32Array
  wpX: Float32Array
  wpY: Float32Array
  /** Radians. NaN means the waypoint has no face override. */
  wpFace: Float32Array
  /** 1 = the segment into the next waypoint is linear. */
  wpLinear: Uint8Array
  tanX: Float32Array
  tanY: Float32Array
  hopOrder: { offense: Uint8Array; defense: Uint8Array }
  facingState: Float32Array
  segmentCursor: Uint16Array
  ball: CompiledBall
}

export interface CompiledBall {
  count: number
  /** 0 = carried, 1 = flight. */
  kind: Uint8Array
  /** Author times. Float64 so a value such as 2.9 still compares equal to the JSON number. */
  t0: Float64Array
  t1: Float64Array
  /** Carrier index, or the thrower for a flight. */
  from: Int16Array
  /** Receiver index, or -1 when carried. */
  to: Int16Array
  apex: Float32Array
  x0: Float32Array
  y0: Float32Array
  z0: Float32Array
  x1: Float32Array
  y1: Float32Array
  z1: Float32Array
  cursor: { index: number }
}

export interface BallPose {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  carrierIndex: number
}

/** Field-frame pose. heading is radians, 0 = +x. */
export interface PlayerPose {
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  speed: number
}
