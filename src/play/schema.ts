import { z } from 'zod'
import type { PlayFile, PlayLoadError, PlayWarning, PlayerTrack, Waypoint } from './types'

const positions = [
  'QB',
  'RB',
  'FB',
  'WR',
  'TE',
  'LT',
  'LG',
  'C',
  'RG',
  'RT',
  'DE',
  'DT',
  'NT',
  'LB',
  'CB',
  'S',
] as const

const waypointSchema = z.strictObject({
  t: z.number().min(-10),
  x: z.number().min(0).max(120),
  y: z.number().min(-2).max(55.333),
  face: z.number().min(-360).max(360).optional(),
  interp: z.enum(['smooth', 'linear']).optional(),
})

/**
 * Six is the longest route that still fits the triangle budget for every player.
 * Twenty-two players at this cap are 110 chords, 220 ribbon triangles.
 */
export const MAX_WAYPOINTS = 6

const playerSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  team: z.enum(['offense', 'defense']),
  position: z.enum(positions),
  jersey: z.number().int().min(0).max(99),
  role: z.string().optional(),
  waypoints: z.array(waypointSchema).min(1).max(MAX_WAYPOINTS),
})

const carriedSchema = z.strictObject({
  kind: z.literal('carried'),
  t0: z.number().min(-10),
  t1: z.number(),
  carrier: z.string(),
})

const flightSchema = z.strictObject({
  kind: z.literal('flight'),
  t0: z.number().min(-10),
  t1: z.number(),
  from: z.string(),
  to: z.string(),
  apex: z.number().min(0).max(30).optional(),
})

export const PlaySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    meta: z.strictObject({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      offenseFormation: z.string().optional(),
      defenseFront: z.string().optional(),
      coverage: z.string().optional(),
      description: z.string().optional(),
      lineOfScrimmageX: z.number().min(10).max(110),
      ballY: z.number().min(0).max(53.333),
      duration: z.number().gt(0).max(15),
      offenseDirection: z.literal('+x'),
    }),
    players: z.array(playerSchema).length(22),
    ball: z.strictObject({
      segments: z.array(z.discriminatedUnion('kind', [carriedSchema, flightSchema])).min(1),
    }),
  })
  .superRefine((play, ctx) => {
    for (const error of semanticErrors(play)) {
      ctx.addIssue({
        code: 'custom',
        path: error.zodPath,
        message: error.message,
      })
    }
  })

interface SemanticIssue {
  zodPath: (string | number)[]
  message: string
}

function semanticErrors(play: PlayFile): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const ids = new Set<string>()
  const jerseys: Record<'offense' | 'defense', Set<number>> = {
    offense: new Set(),
    defense: new Set(),
  }
  let offense = 0
  let defense = 0
  const duration = play.meta.duration
  const los = play.meta.lineOfScrimmageX

  play.players.forEach((player, i) => {
    if (ids.has(player.id)) {
      issues.push({
        zodPath: ['players', i, 'id'],
        message: `duplicate id ${player.id}`,
      })
    }
    ids.add(player.id)
    if (player.team === 'offense') offense += 1
    else defense += 1
    if (jerseys[player.team].has(player.jersey)) {
      issues.push({
        zodPath: ['players', i, 'jersey'],
        message: `duplicate jersey ${player.jersey}`,
      })
    }
    jerseys[player.team].add(player.jersey)

    const wps = player.waypoints
    const first = wps[0]
    const last = wps[wps.length - 1]
    if (first != null && first.t > 0) {
      issues.push({
        zodPath: ['players', i, 'waypoints', 0, 't'],
        message: 'must be <= 0 (t<0 = pre-snap)',
      })
    }
    if (last != null && last.t !== duration) {
      issues.push({
        zodPath: ['players', i, 'waypoints', wps.length - 1, 't'],
        message: `must equal duration (${duration})`,
      })
    }
    for (let k = 0; k < wps.length - 1; k += 1) {
      const a = wps[k]
      const b = wps[k + 1]
      if (a == null || b == null) continue
      if (b.t <= a.t) {
        issues.push({
          zodPath: ['players', i, 'waypoints', k + 1, 't'],
          message: `must be greater than previous (${a.t})`,
        })
        continue
      }
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const speed = dist / (b.t - a.t)
      if (speed > 11) {
        issues.push({
          zodPath: ['players', i, 'waypoints', k + 1],
          message: `speed ${speed.toFixed(1)} yd/s > 11`,
        })
      }
    }
    if (first != null) {
      const x0 = sampleAxis(wps, 0, 'x')
      const offenseSide = player.team === 'offense'
      if (offenseSide !== x0 < los) {
        issues.push({
          zodPath: ['players', i],
          message: 'wrong side of LOS at snap',
        })
      }
    }
  })

  if (offense !== 11 || defense !== 11) {
    issues.push({
      zodPath: ['players'],
      message: `expected 11 offense and 11 defense, found ${offense} and ${defense}`,
    })
  }

  const segs = play.ball.segments
  const seg0 = segs[0]
  const segN = segs[segs.length - 1]
  if (seg0 != null && seg0.t0 > 0) {
    issues.push({ zodPath: ['ball', 'segments', 0, 't0'], message: 'must be <= 0' })
  }
  if (segN != null && segN.t1 !== duration) {
    issues.push({
      zodPath: ['ball', 'segments', segs.length - 1, 't1'],
      message: `must equal duration (${duration})`,
    })
  }
  segs.forEach((seg, i) => {
    if (seg.t1 <= seg.t0) {
      issues.push({
        zodPath: ['ball', 'segments', i, 't1'],
        message: 'must be greater than t0',
      })
    }
    const refs =
      seg.kind === 'carried'
        ? [['carrier', seg.carrier] as const]
        : ([
            ['from', seg.from],
            ['to', seg.to],
          ] as const)
    for (const [key, id] of refs) {
      if (!ids.has(id)) {
        issues.push({
          zodPath: ['ball', 'segments', i, key],
          message: `unknown id ${id}`,
        })
      }
    }
  })
  for (let i = 0; i < segs.length - 1; i += 1) {
    const a = segs[i]
    const b = segs[i + 1]
    if (a == null || b == null) continue
    if (Math.abs(a.t1 - b.t0) > 1e-9) {
      issues.push({
        zodPath: ['ball', 'segments', i, 't1'],
        message: `gap or overlap before ${b.t0}`,
      })
    }
    const end = a.kind === 'carried' ? a.carrier : a.to
    const start = b.kind === 'carried' ? b.carrier : b.from
    if (end !== start) {
      issues.push({
        zodPath: ['ball', 'segments', i, 't1'],
        message: `handoff mismatch ${end} -> ${start}`,
      })
    }
  }

  return issues
}

function sampleAxis(wps: readonly Waypoint[], t: number, key: 'x' | 'y'): number {
  const first = wps[0]
  if (first == null || t <= first.t) return first?.[key] ?? 0
  for (let i = 0; i < wps.length - 1; i += 1) {
    const a = wps[i]
    const b = wps[i + 1]
    if (a == null || b == null) continue
    if (a.t <= t && t <= b.t) {
      const span = b.t - a.t
      const u = span === 0 ? 0 : (t - a.t) / span
      return a[key] + (b[key] - a[key]) * u
    }
  }
  const last = wps[wps.length - 1]
  return last?.[key] ?? 0
}

function sampleXY(player: PlayerTrack, t: number): { x: number; y: number } {
  return { x: sampleAxis(player.waypoints, t, 'x'), y: sampleAxis(player.waypoints, t, 'y') }
}

/** Non-blocking proximity warnings. Positions are piecewise-linear, matching validate.py. */
export function collectWarnings(play: PlayFile): PlayWarning[] {
  const warnings: PlayWarning[] = []
  const players = play.players
  const seenSnap = new Set<string>()
  for (let i = 0; i < players.length; i += 1) {
    const a = players[i]
    if (a == null) continue
    const pa = sampleXY(a, 0)
    for (let j = i + 1; j < players.length; j += 1) {
      const b = players[j]
      if (b == null) continue
      const pb = sampleXY(b, 0)
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 0.5) {
        const key = `${a.id}:${b.id}`
        if (!seenSnap.has(key)) {
          seenSnap.add(key)
          warnings.push({
            path: 'players',
            playerId: a.id,
            message: `${a.id} and ${b.id} are within 0.5 yd at the snap`,
          })
        }
      }
    }
  }

  const streak = new Map<string, number>()
  const warned = new Set<string>()
  const end = play.meta.duration
  for (let t = 0; t <= end + 1e-9; t += 0.05) {
    for (let i = 0; i < players.length; i += 1) {
      const a = players[i]
      if (a == null) continue
      const pa = sampleXY(a, t)
      for (let j = i + 1; j < players.length; j += 1) {
        const b = players[j]
        if (b == null) continue
        const key = `${a.id}:${b.id}`
        const pb = sampleXY(b, t)
        const close = Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 0.3
        if (close) {
          if (!streak.has(key)) streak.set(key, t)
        } else if (streak.has(key)) {
          const start = streak.get(key) ?? t
          if (t - start > 0.5 && !warned.has(key)) {
            warned.add(key)
            warnings.push({
              path: 'players',
              playerId: a.id,
              message: `${a.id} and ${b.id} stay within 0.3 yd for more than 0.5 s`,
            })
          }
          streak.delete(key)
        }
      }
    }
  }
  for (const [key, start] of streak) {
    if (end - start > 0.5 && !warned.has(key)) {
      const [a, b] = key.split(':')
      warnings.push({
        path: 'players',
        playerId: a,
        message: `${a} and ${b} stay within 0.3 yd for more than 0.5 s`,
      })
    }
  }
  return warnings
}

export function formatZodPath(path: readonly PropertyKey[]): string {
  let out = ''
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`
    else out += out.length === 0 ? String(part) : `.${String(part)}`
  }
  return out
}

export function playerIdAt(data: unknown, index: number): string | undefined {
  if (typeof data !== 'object' || data == null || !('players' in data)) return undefined
  const players = (data as { players: unknown }).players
  if (!Array.isArray(players)) return undefined
  const player = players[index]
  if (typeof player !== 'object' || player == null || !('id' in player)) return undefined
  const id = (player as { id: unknown }).id
  return typeof id === 'string' ? id : undefined
}

export function zodIssuesToErrors(error: z.ZodError, data: unknown): PlayLoadError[] {
  return error.issues.map((issue) => {
    const path = formatZodPath(issue.path)
    const index =
      issue.path[0] === 'players' && typeof issue.path[1] === 'number' ? issue.path[1] : -1
    const playerId = index >= 0 ? playerIdAt(data, index) : undefined
    return {
      kind: issue.code === 'custom' ? 'semantic' : 'schema',
      path,
      message: issue.message,
      ...(playerId != null ? { playerId } : {}),
    }
  })
}
