import { FORMATIONS } from '../editor/formations'
import { FIELD_WIDTH } from '../play/coords'
import { LOS_Y, VIEW_YARDS } from './geometry'
import { blankDiagram } from './model'
import type { Diagram, DPlayer, TokenColor } from './types'

const SLOT_COLOR: Record<string, TokenColor> = {
  x: 'red',
  z: 'blue',
  y: 'orange',
  h: 'purple',
  rb: 'green',
  qb: 'black',
}
const LINE = new Set(['lt', 'lg', 'c', 'rg', 'rt'])

/**
 * A playbook's base alignment as a diagram: the preset's players at their spots, linemen as
 * plain circles with a square center, skill players coloured by slot. Unknown or missing
 * keys give the blank line.
 */
export function diagramFromFormation(key: string | null): Diagram {
  const formation = key == null ? undefined : FORMATIONS[key]
  if (formation == null || formation.side !== 'ours') return blankDiagram()
  const players: DPlayer[] = formation.players.map((spot, i) => {
    const dy = spot.align.dy
    const dx = spot.align.dx
    const lineman = LINE.has(spot.slot)
    return {
      id: `p${i + 1}`,
      shape: 'circle',
      color: lineman ? 'white' : (SLOT_COLOR[spot.slot] ?? 'white'),
      fillStyle: 'solid',
      // Offense moves up the page; +dy is its left, which is the page's left.
      x: Math.min(1, Math.max(0, 0.5 - dy / FIELD_WIDTH)),
      y: Math.min(1, Math.max(0, LOS_Y - dx / VIEW_YARDS)),
      ...(lineman ? {} : { label: spot.slot.toUpperCase() }),
      ...(spot.slot === 'c' ? { square: true } : {}),
    }
  })
  return { formation: formation.name, players, lines: [], notes: [] }
}
