import { z } from 'zod'

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

const legSchema = z.object({
  to: z.object({ dx: z.number(), dy: z.number() }),
  dur: z.number().optional(),
  speed: z.number().optional(),
  interp: z.enum(['smooth', 'linear']).optional(),
  face: z.number().optional(),
  label: z.string().optional(),
})

const alignSchema = z.union([
  z.object({
    anchor: z.enum(['ball', 'strong#1', 'strong#2', 'weak#1', 'weak#2']),
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({ dx: z.number(), dy: z.number() }),
])

const playerFields = {
  slot: z.string(),
  position: z.enum(positions),
  jersey: z.number().optional(),
  role: z.string().optional(),
  face: z.number().optional(),
  legs: z.array(legSchema),
}

export const PlaySourceSchema = z.object({
  sourceVersion: z.literal(1),
  id: z.string().optional(),
  name: z.string(),
  side: z.enum(['offense', 'defense']),
  formation: z.string().optional(),
  description: z.string().optional(),
  ballSpot: z.object({
    yardLine: z.number(),
    hash: z.enum(['L', 'M', 'R']),
  }),
  duration: z.number(),
  players: z.array(
    z.object({ ...playerFields, align: z.object({ dx: z.number(), dy: z.number() }) }),
  ),
  defaultLookId: z.string().optional(),
  ball: z.object({
    snap: z.enum(['shotgun', 'under-center']),
    segments: z.array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('carried'),
          t0: z.number(),
          t1: z.number(),
          carrier: z.string(),
        }),
        z.object({
          kind: z.literal('flight'),
          t0: z.number(),
          t1: z.number(),
          from: z.string(),
          to: z.string(),
          apex: z.number().optional(),
        }),
      ]),
    ),
  }),
  adjustments: z.array(
    z.object({
      when: z.object({
        coverage: z.string().optional(),
        front: z.string().optional(),
        lookIds: z.array(z.string()).optional(),
      }),
      overrides: z.array(z.object({ slot: z.string(), legs: z.array(legSchema) })),
    }),
  ),
})

export const LookSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  side: z.enum(['offense', 'defense']),
  front: z.string().optional(),
  coverage: z.string().optional(),
  players: z.array(z.object({ ...playerFields, align: alignSchema })),
})
