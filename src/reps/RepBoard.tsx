import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { DEPTH_SCALE, type BoardLayout } from '../playsheet/board'
import { PlayBoard } from '../playsheet/PlayBoard'
import { clampToBoard, fromBoard, toBoard, type RepSpot } from './target'

const optional = () => 'optional' as const
const ignore = () => {}

/**
 * The play board with a layer on top for a scout rep: the target circle, and the spot a
 * player picks. Tapping or dragging on the board moves the point being edited; arrow keys
 * move it half a yard.
 */
export function RepBoard({
  layout,
  name,
  slot,
  target,
  tolerance,
  answer,
  missed,
  onPick,
  label,
}: {
  layout: BoardLayout
  name: string
  /** The position being tested, ringed and marked "You" on the board. */
  slot: string
  /** The right spot. Null keeps it hidden. */
  target: RepSpot | null
  tolerance: number | null
  /** The player's spot. */
  answer?: RepSpot | null
  /** Draw the answer as a miss. */
  missed?: boolean
  /** When set, the board takes taps and drags and reports the new spot. */
  onPick?: (spot: RepSpot) => void
  /** What a tap does, for screen readers. */
  label: string
}) {
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const editing = onPick != null
  const moving = answer !== undefined ? answer : target

  function pick(event: PointerEvent<SVGSVGElement>) {
    const el = svg.current
    const matrix = el?.getScreenCTM()
    if (el == null || matrix == null || onPick == null) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    onPick(fromBoard(layout, clampToBoard(layout, { x: point.x, y: point.y })))
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (onPick == null) return
    const step = event.shiftKey ? 2 : 0.5
    const from = moving ?? { x: 0, y: 0 }
    const moves: Record<string, RepSpot> = {
      ArrowUp: { x: from.x + step, y: from.y },
      ArrowDown: { x: from.x - step, y: from.y },
      ArrowLeft: { x: from.x, y: from.y + step },
      ArrowRight: { x: from.x, y: from.y - step },
    }
    const next = moves[event.key]
    if (next == null) return
    event.preventDefault()
    onPick(next)
  }

  const t = target == null ? null : toBoard(layout, target)
  const a = answer == null ? null : toBoard(layout, answer)

  return (
    <div className="rep-board">
      <PlayBoard
        layout={layout}
        name={name}
        selected={slot}
        mine={slot}
        status={optional}
        showStatus={false}
        onSelect={ignore}
      />
      <svg
        ref={svg}
        className="rep-overlay"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        data-editing={editing ? 'true' : undefined}
        role={editing ? 'application' : 'img'}
        aria-label={label}
        tabIndex={editing ? 0 : -1}
        onKeyDown={onKey}
        onPointerDown={(event) => {
          if (!editing) return
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          pick(event)
        }}
        onPointerMove={(event) => {
          if (dragging.current) pick(event)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
        data-testid="rep-overlay"
      >
        {t != null && tolerance != null ? (
          <g className="rep-target" data-testid="rep-target">
            <ellipse cx={t.x} cy={t.y} rx={tolerance} ry={tolerance * DEPTH_SCALE} />
            <line x1={t.x - 0.6} y1={t.y} x2={t.x + 0.6} y2={t.y} />
            <line x1={t.x} y1={t.y - 0.6} x2={t.x} y2={t.y + 0.6} />
          </g>
        ) : null}
        {t != null && a != null ? (
          <line className="rep-gap" x1={a.x} y1={a.y} x2={t.x} y2={t.y} />
        ) : null}
        {a != null ? (
          <g
            className="rep-answer"
            data-missed={missed ? 'true' : undefined}
            data-testid="rep-answer"
          >
            <circle cx={a.x} cy={a.y} r="0.9" />
            <circle className="rep-answer-dot" cx={a.x} cy={a.y} r="0.25" />
          </g>
        ) : null}
      </svg>
    </div>
  )
}
