import { useMemo, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { FIELD_LENGTH, FIELD_WIDTH } from '../play/coords'
import { fieldConfig, type FieldConfig } from '../field/fieldConfig'
import type { RouteEnd } from '../play/sourceTypes'
import { fieldToScreen, fitView, hitTest, screenToField, type Hit, type View } from './hitTest'
import { isLineman, markOf, onColor, playerColor, routeColor } from './routeKinds'
import {
  chartLayout,
  isLegRef,
  sameRef,
  type ChartPlayer,
  type EditorState,
  type PlayerRef,
} from './state'

export interface CanvasPointer {
  phase: 'down' | 'move' | 'up'
  /** What the pointer is on. Fixed at pointerdown, so a drag keeps its target. */
  hit: Hit
  /** Pointer position in absolute field yards. */
  field: { x: number; y: number }
  shiftKey: boolean
}

export interface EditorCanvasProps {
  state: Pick<EditorState, 'source' | 'look' | 'selection'>
  width: number
  height: number
  /** 90 (default) = vertical, offense moving up. 0 = horizontal, offense moving right. */
  rotate?: 0 | 90
  config?: FieldConfig
  /** Yards shown behind and ahead of the line of scrimmage. */
  behind?: number
  ahead?: number
  /** Small, static snapshot for lists: offense only is typical, no waypoints, labels or numbers. */
  compact?: boolean
  /** A line being drawn right now, in absolute field yards. Dashed, not saved. */
  ghost?: { x: number; y: number }[] | null
  /** Double-click on a player: where its circle is, in canvas px. */
  onEditPlayer?: (ref: PlayerRef, at: { px: number; py: number }) => void
  /** Draw the defensive look. Default true. */
  showDefense?: boolean
  /** Called on pointerdown with what was hit. The canvas itself never edits the chart. */
  onHit?: (hit: Hit) => void
  /** Down, move (while pressed) and up. The pointer is captured, so a drag can leave the box. */
  onPointer?: (event: CanvasPointer) => void
}

const COLORS = {
  grass: '#2f6b35',
  line: 'rgba(255,255,255,0.55)',
  faint: 'rgba(255,255,255,0.22)',
  los: '#4aa3ff',
  oursText: '#141414',
  theirs: '#ff7a6b',
  selected: '#ffd84a',
}

function label(p: ChartPlayer, slot: string): string {
  if (p.mark != null) return p.mark
  return markOf(slot, p.position, p.ref.side)
}

const round = (v: number) => Math.round(v * 10) / 10

type Px = { px: number; py: number }

/** Squiggle along a→b: the motion line. */
function squiggle(a: Px, b: Px, amp: number): string {
  const len = Math.hypot(b.px - a.px, b.py - a.py)
  if (len < 1) return `${a.px},${a.py} ${b.px},${b.py}`
  const ux = (b.px - a.px) / len
  const uy = (b.py - a.py) / len
  const steps = Math.max(2, Math.round(len / 3))
  const out: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    // Taper to zero at both ends so the line joins the dot and the arrow cleanly.
    const wave = Math.sin(t * len * 0.55) * amp * Math.min(1, t * 6, (1 - t) * 6)
    out.push(
      `${round(a.px + (b.px - a.px) * t - uy * wave)},${round(a.py + (b.py - a.py) * t + ux * wave)}`,
    )
  }
  return out.join(' ')
}

/** The end of a line: an arrowhead, a flat block cap, or nothing. */
function endCap(end: RouteEnd, a: Px, b: Px, color: string, size: number): ReactNode {
  const len = Math.hypot(b.px - a.px, b.py - a.py)
  if (len < 1 || end === 'none') return null
  const ux = (b.px - a.px) / len
  const uy = (b.py - a.py) / len
  const nx = -uy
  const ny = ux
  if (end === 'block') {
    const half = size * 0.9
    return (
      <line
        data-cap="block"
        x1={round(b.px + nx * half)}
        y1={round(b.py + ny * half)}
        x2={round(b.px - nx * half)}
        y2={round(b.py - ny * half)}
        stroke={color}
        strokeWidth={Math.max(2, size * 0.35)}
        strokeLinecap="round"
      />
    )
  }
  const back = { x: b.px - ux * size * 1.5, y: b.py - uy * size * 1.5 }
  const pts = [
    `${round(b.px)},${round(b.py)}`,
    `${round(back.x + nx * size * 0.8)},${round(back.y + ny * size * 0.8)}`,
    `${round(back.x - nx * size * 0.8)},${round(back.y - ny * size * 0.8)}`,
  ]
  return <polygon data-cap="arrow" points={pts.join(' ')} fill={color} />
}

/** Read-only SVG chart of all 22 players and their routes. Drawn in screen px from `View`. */
export function EditorCanvas({
  state,
  width,
  height,
  rotate = 90,
  config = fieldConfig(),
  behind = 15,
  ahead = 25,
  compact = false,
  showDefense = true,
  ghost = null,
  onEditPlayer,
  onHit,
  onPointer,
}: EditorCanvasProps) {
  const layout = useMemo(() => chartLayout(state, config), [state, config])
  const view: View = useMemo(
    () =>
      fitView(
        width,
        height,
        {
          x0: Math.max(0, layout.los - behind),
          x1: Math.min(FIELD_LENGTH, layout.los + ahead),
        },
        rotate,
      ),
    [width, height, layout.los, behind, ahead, rotate],
  )
  const pressed = useRef<{ id: number; hit: Hit } | null>(null)
  const at = (x: number, y: number) => {
    const { px, py } = fieldToScreen(x, y, view)
    return { px: round(px), py: round(py) }
  }
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const a = at(x0, y0)
    const b = at(x1, y1)
    return { x1: a.px, y1: a.py, x2: b.px, y2: b.py }
  }

  const yardLines: number[] = []
  for (let x = 10; x <= 110; x += 5) yardLines.push(x)
  const hashLines: number[] = []
  if (!compact) for (let x = 11; x < 110; x += 1) if (x % 5 !== 0) hashLines.push(x)
  const numbers: { x: number; n: number }[] = []
  if (!compact) {
    for (let x = 20; x <= 100; x += 10) numbers.push({ x, n: Math.min(x - 10, 110 - x) })
  }
  const [hashR, hashL] = config.hashY
  const radius = compact
    ? Math.min(7, Math.max(3.5, 0.9 * view.scale))
    : Math.min(18, Math.max(9, 0.9 * view.scale))
  const stroke = compact ? 1.6 : 2.5
  const capSize = compact ? 4 : 7
  const selection = compact ? null : state.selection
  const isSelected = (p: ChartPlayer) =>
    selection != null && selection.side === p.ref.side && selection.slot === p.ref.slot
  const selectedLeg = isLegRef(selection) ? selection.leg : null
  const visible = layout.players.filter((p) => showDefense || p.ref.side === 'ours')
  // Screen direction of "downfield": the way a lineman's block cap points.
  const fwdA = at(layout.los, layout.ballY)
  const fwdB = at(layout.los + 1, layout.ballY)
  const fwdLen = Math.hypot(fwdB.px - fwdA.px, fwdB.py - fwdA.py) || 1
  const fwd = { x: (fwdB.px - fwdA.px) / fwdLen, y: (fwdB.py - fwdA.py) / fwdLen }

  const emit = (phase: CanvasPointer['phase'], event: PointerEvent<SVGSVGElement>, hit: Hit) => {
    const box = event.currentTarget.getBoundingClientRect()
    const field = screenToField(event.clientX - box.left, event.clientY - box.top, view)
    onPointer?.({ phase, hit, field, shiftKey: event.shiftKey })
  }
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (onHit == null && onPointer == null) return
    const box = event.currentTarget.getBoundingClientRect()
    const hit = hitTest(
      state,
      event.clientX - box.left,
      event.clientY - box.top,
      view,
      config,
      layout,
    )
    onHit?.(hit)
    if (onPointer == null) return
    pressed.current = { id: event.pointerId, hit }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Not an active pointer (a synthetic event): the drag still works inside the box.
    }
    emit('down', event, hit)
  }
  const onDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
    if (onEditPlayer == null) return
    const box = event.currentTarget.getBoundingClientRect()
    const hit = hitTest(
      state,
      event.clientX - box.left,
      event.clientY - box.top,
      view,
      config,
      layout,
    )
    if (hit.kind !== 'player') return
    const player = layout.players.find((p) => sameRef(p.ref, hit.ref))
    const origin = player?.points[0]
    if (origin == null) return
    onEditPlayer(hit.ref, at(origin.x, origin.y))
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const p = pressed.current
    if (p == null || p.id !== event.pointerId) return
    emit('move', event, p.hit)
  }
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const p = pressed.current
    if (p == null || p.id !== event.pointerId) return
    pressed.current = null
    emit('up', event, p.hit)
  }

  const tl = at(0, FIELD_WIDTH)
  const br = at(FIELD_LENGTH, 0)
  return (
    <svg
      className={compact ? 'editor-canvas editor-canvas-compact' : 'editor-canvas'}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={compact ? 'img' : 'application'}
      aria-label={`Play chart: ${state.source.name}`}
      style={{ touchAction: 'none', display: 'block', background: COLORS.grass }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <g aria-hidden="true">
        <rect
          x={Math.min(tl.px, br.px)}
          y={Math.min(tl.py, br.py)}
          width={Math.abs(br.px - tl.px)}
          height={Math.abs(br.py - tl.py)}
          fill="none"
          stroke={COLORS.line}
          strokeWidth={2}
        />
        {yardLines.map((x) => (
          <line
            key={`y${x}`}
            {...line(x, 0, x, FIELD_WIDTH)}
            stroke={compact ? COLORS.faint : COLORS.line}
          />
        ))}
        {hashLines.map((x) => (
          <g key={`h${x}`}>
            <line {...line(x, hashR - 0.5, x, hashR + 0.5)} stroke={COLORS.line} />
            <line {...line(x, hashL - 0.5, x, hashL + 0.5)} stroke={COLORS.line} />
          </g>
        ))}
        {numbers.flatMap(({ x, n }) =>
          [7, FIELD_WIDTH - 7].map((y) => {
            const p = at(x, y)
            return (
              <text
                key={`n${x}:${y}`}
                data-yard-number={n}
                x={p.px}
                y={p.py}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(10, 1.6 * view.scale)}
                fontWeight={700}
                fontFamily="system-ui, sans-serif"
                fill={COLORS.faint}
              >
                {n}
              </text>
            )
          }),
        )}
        <line
          {...line(layout.los, 0, layout.los, FIELD_WIDTH)}
          stroke={COLORS.los}
          strokeWidth={compact ? 2 : 3}
          data-testid="editor-los"
        />
      </g>
      <g className="editor-routes">
        {visible
          .filter((p) => p.points.length > 1)
          .map((p) => {
            const selected = isSelected(p)
            const color = selected ? COLORS.selected : routeColor(p.ref.slot, p.position)
            const points = p.points.map((point) => at(point.x, point.y))
            const last = p.kinds.length - 1
            return (
              <g
                key={`${p.ref.side}:${p.ref.slot}`}
                data-route={`${p.ref.side}:${p.ref.slot}`}
                data-kind={p.kinds[last]}
                aria-hidden="true"
              >
                {p.kinds.map((kind, leg) => {
                  const a = points[leg]
                  const b = points[leg + 1]
                  if (a == null || b == null) return null
                  const common = {
                    fill: 'none',
                    stroke: color,
                    strokeWidth: selected ? stroke + 1.5 : stroke,
                    strokeLinecap: 'round' as const,
                    strokeLinejoin: 'round' as const,
                  }
                  return kind === 'motion' ? (
                    <polyline
                      key={leg}
                      data-leg-kind="motion"
                      points={squiggle(a, b, capSize * 0.45)}
                      {...common}
                    />
                  ) : (
                    <line
                      key={leg}
                      data-leg-kind={kind}
                      x1={a.px}
                      y1={a.py}
                      x2={b.px}
                      y2={b.py}
                      {...common}
                    />
                  )
                })}
                {(() => {
                  const a = points[last]
                  const b = points[last + 1]
                  const end = p.ends[last]
                  if (a == null || b == null || end == null) return null
                  return endCap(end, a, b, color, capSize + (selected ? 1.5 : 0))
                })()}
                {selected &&
                  points
                    .slice(1)
                    .map((point, leg) => (
                      <circle
                        key={leg}
                        cx={point.px}
                        cy={point.py}
                        r={leg === selectedLeg ? 7 : 5}
                        fill={leg === selectedLeg ? COLORS.selected : COLORS.grass}
                        stroke={COLORS.selected}
                        strokeWidth={2}
                        data-waypoint={leg}
                      />
                    ))}
                {!compact &&
                  p.labels.map((text, leg) => {
                    const end = points[leg + 1]
                    if (text == null || end == null) return null
                    return (
                      <text
                        key={`l${leg}`}
                        x={end.px + 6}
                        y={end.py - 6}
                        fill={color}
                        fontSize={11}
                        fontFamily="system-ui, sans-serif"
                      >
                        {text}
                      </text>
                    )
                  })}
              </g>
            )
          })}
      </g>
      {ghost != null && ghost.length > 1 ? (
        <polyline
          data-ghost="true"
          aria-hidden="true"
          points={ghost
            .map((point) => at(point.x, point.y))
            .map((point) => `${point.px},${point.py}`)
            .join(' ')}
          fill="none"
          stroke={COLORS.selected}
          strokeWidth={stroke}
          strokeDasharray="6 5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <g className="editor-players">
        {visible.map((p) => {
          const { px, py } = at(p.points[0]?.x ?? 0, p.points[0]?.y ?? 0)
          const selected = isSelected(p)
          const name = label(p, p.ref.slot)
          const ours = p.ref.side === 'ours'
          const fill = playerColor(p.ref.slot, p.position)
          const lineman = ours && isLineman(p.position)
          return (
            <g
              key={`${p.ref.side}:${p.ref.slot}`}
              data-player={`${p.ref.side}:${p.ref.slot}`}
              data-selected={selected ? 'true' : undefined}
              role="img"
              aria-label={`${ours ? 'Offense' : 'Defense'} ${p.position}${p.jersey != null ? ` #${p.jersey}` : ''} (${p.ref.slot})${selected ? ', selected' : ''}`}
            >
              {selected && (
                <circle
                  cx={px}
                  cy={py}
                  r={radius + 5}
                  fill="none"
                  stroke={COLORS.selected}
                  strokeWidth={3}
                />
              )}
              {lineman && (
                <g
                  data-block-cap="true"
                  stroke="#f4f1ea"
                  strokeWidth={compact ? 1.4 : 2.5}
                  strokeLinecap="round"
                >
                  <line
                    x1={px + fwd.x * radius}
                    y1={py + fwd.y * radius}
                    x2={px + fwd.x * radius * 1.7}
                    y2={py + fwd.y * radius * 1.7}
                  />
                  <line
                    x1={px + fwd.x * radius * 1.7 - fwd.y * radius * 0.8}
                    y1={py + fwd.y * radius * 1.7 + fwd.x * radius * 0.8}
                    x2={px + fwd.x * radius * 1.7 + fwd.y * radius * 0.8}
                    y2={py + fwd.y * radius * 1.7 - fwd.x * radius * 0.8}
                  />
                </g>
              )}
              {ours ? (
                <circle
                  cx={px}
                  cy={py}
                  r={radius}
                  fill={fill}
                  stroke="#141414"
                  strokeWidth={compact ? 1 : 1.5}
                />
              ) : null}
              {compact && ours ? null : (
                <text
                  x={px}
                  y={py}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={ours ? Math.max(9, radius * 0.8) : Math.max(compact ? 7 : 11, radius)}
                  fontWeight={700}
                  fontFamily="system-ui, sans-serif"
                  fill={ours ? (lineman ? COLORS.oursText : onColor(fill)) : COLORS.theirs}
                >
                  {name}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
