import { describe, expect, it } from 'vitest'
import { compileChart } from '../src/editor/compileAdapter'
import { FORMATIONS } from '../src/editor/formations'
import { blankPlay } from '../src/playbook/newPlays'
import {
  applyRoutes,
  buildPlaybook,
  buildTemplatePlay,
  PLAYBOOK_TEMPLATES,
} from '../src/playbook/playbooks'
import { buildRoute, legsSeconds, ROUTE_IDS } from '../src/playbook/routeTree'
import { PlaySourceSchema } from '../src/play/sourceSchema'

const left = { position: 'WR' as const, align: { dx: -1, dy: 14 } }
const right = { position: 'WR' as const, align: { dx: -1, dy: -14 } }

function endDy(legs: { to: { dy: number } }[]): number {
  return legs.reduce((sum, leg) => sum + leg.to.dy, 0)
}

describe('route tree', () => {
  it('builds legs with timing for every route', () => {
    for (const id of ROUTE_IDS) {
      const legs = buildRoute(id, left)
      expect(legs.length).toBeGreaterThan(0)
      expect(legsSeconds(legs)).toBeGreaterThan(0)
    }
  })

  it('mirrors routes to the side the receiver lines up on', () => {
    for (const id of ROUTE_IDS) {
      const l = buildRoute(id, left).map((leg) => leg.to)
      const r = buildRoute(id, right).map((leg) => leg.to)
      expect(r).toEqual(l.map((to) => ({ dx: to.dx, dy: -to.dy + 0 })))
    }
  })

  it('breaks slants and posts inside, outs and corners outside', () => {
    expect(endDy(buildRoute('slant', left))).toBeLessThan(0)
    expect(endDy(buildRoute('post', left))).toBeLessThan(0)
    expect(endDy(buildRoute('out', left))).toBeGreaterThan(0)
    expect(endDy(buildRoute('corner', right))).toBeLessThan(0)
  })
})

describe('applyRoutes', () => {
  it('replaces only the listed slots and leaves the input alone', () => {
    const { source } = blankPlay('Test')
    const before = JSON.stringify(source)
    const next = applyRoutes(source, { x: 'slant', z: 'go' })
    expect(JSON.stringify(source)).toBe(before)
    for (const player of next.players) {
      const expected = player.slot === 'x' || player.slot === 'z' ? true : false
      expect(player.legs.length > 0).toBe(expected)
    }
  })
})

describe('playbook templates', () => {
  it('uses offense formations that exist', () => {
    for (const template of PLAYBOOK_TEMPLATES) {
      expect(FORMATIONS[template.formation]?.side).toBe('ours')
    }
  })

  for (const template of PLAYBOOK_TEMPLATES) {
    describe(template.name, () => {
      const plays = buildPlaybook(template.id)

      it('has one play per spec with unique names', () => {
        expect(plays).toHaveLength(template.plays.length)
        expect(new Set(plays.map((play) => play.source.name)).size).toBe(plays.length)
      })

      it.each(plays.map((play) => [play.source.name, play] as const))(
        '%s is a valid 11-player source that compiles',
        (_name, play) => {
          expect(PlaySourceSchema.safeParse(play.source).success).toBe(true)
          expect(play.source.players).toHaveLength(11)
          expect(play.source.formation).toBe(FORMATIONS[template.formation]?.name)
          const chart = compileChart(play.source, play.look)
          expect(chart.errors).toEqual([])
          expect(chart.play).not.toBeNull()
        },
      )

      it('throws to a receiver who has a route', () => {
        for (const spec of template.plays) {
          const play = buildTemplatePlay(template, spec)
          const target = play.source.players.find((player) => player.slot === spec.throwTo)
          expect(target?.legs.length ?? 0).toBeGreaterThan(0)
          const last = play.source.ball.segments.at(-1)
          expect(last).toMatchObject({ kind: 'carried', carrier: spec.throwTo })
          expect(last?.t1).toBe(play.source.duration)
        }
      })
    })
  }
})
