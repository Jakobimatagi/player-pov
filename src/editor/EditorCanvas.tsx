import { useMemo, type PointerEvent } from 'react'
import { FIELD_LENGTH, FIELD_WIDTH } from '../play/coords'
import { fieldConfig, type FieldConfig } from '../field/fieldConfig'
import { fieldToScreen, fitView, hitTest, type Hit, type View } from './hitTest'
import { chartLayout, isLegRef, type ChartPlayer, type EditorState } from './state'

export interface EditorCanvasProps {
  state: Pick<EditorState, 'source' | 'look' | 'selection'>
  width: number
  height: number
  rotate?: 0 | 90
  config?: FieldConfig
  /** Yards shown behind and ahead of the line of scrimmage. */
  behind?: number
  ahead?: number
  /** Called on pointerdown with what was hit. The canvas itself never edits the chart. */
  onHit?: (hit: Hit) => void
}

const COLORS = {
  grass: '#2f6b35',
  line: 'rgba(255,255,255,0.55)',
  los: '#4aa3ff',
  ours: '#f4f1ea',
  oursText: '#141414',
  theirs: '#ff7a6b',
  route: '#f4f1ea',
  routeTheirs: '#ff7a6b',
  selected: '#ffd84a',
}

function label(p: ChartPlayer, slot: string): string {
  if (p.ref.side === 'ours') return slot.length <= 2 ? slot.toUpperCase() : p.position
  if (p.position === 'LB') return slot.charAt(0).toUpperCase()
  if (p.position === 'S') return slot.slice(0, 2).toUpperCase()
  return p.position
}

const round = (v: number) => Math.round(v * 10) / 10

/** Read-only SVG chart of all 22 players and their routes. Drawn in screen px from `View`. */
export function EditorCanvas({
  state,
  width,
  height,
  rotate = 0,
  config = fieldConfig(),
  behind = 15,
  ahead = 25,
  onHit,
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
  for (let x = 11; x < 110; x += 1) if (x % 5 !== 0) hashLines.push(x)
  const [hashR, hashL] = config.hashY
  const radius = Math.min(18, Math.max(9, 0.9 * view.scale))
  const selection = state.selection
  const isSelected = (p: ChartPlayer) =>
    selection != null && selection.side === p.ref.side && selection.slot === p.ref.slot
  const selectedLeg = isLegRef(selection) ? selection.leg : null

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (onHit == null) return
    const box = event.currentTarget.getBoundingClientRect()
    onHit(hitTest(state, event.clientX - box.left, event.clientY - box.top, view, config, layout))
  }

  const tl = at(0, FIELD_WIDTH)
  const br = at(FIELD_LENGTH, 0)
  return (
    <svg
      className="editor-canvas"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="application"
      aria-label={`Play chart: ${state.source.name}`}
      style={{ touchAction: 'none', display: 'block', background: COLORS.grass }}
      onPointerDown={onPointerDown}
    >
      <defs>
        <marker
          id="editor-arrow-ours"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill={COLORS.route} />
        </marker>
        <marker
          id="editor-arrow-theirs"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill={COLORS.routeTheirs} />
        </marker>
        <marker
          id="editor-arrow-selected"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill={COLORS.selected} />
        </marker>
      </defs>
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
          <line key={`y${x}`} {...line(x, 0, x, FIELD_WIDTH)} stroke={COLORS.line} />
        ))}
        {hashLines.map((x) => (
          <g key={`h${x}`}>
            <line {...line(x, hashR - 0.5, x, hashR + 0.5)} stroke={COLORS.line} />
            <line {...line(x, hashL - 0.5, x, hashL + 0.5)} stroke={COLORS.line} />
          </g>
        ))}
        <line
          {...line(layout.los, 0, layout.los, FIELD_WIDTH)}
          stroke={COLORS.los}
          strokeWidth={3}
          data-testid="editor-los"
        />
      </g>
      <g className="editor-routes">
        {layout.players
          .filter((p) => p.points.length > 1)
          .map((p) => {
            const selected = isSelected(p)
            const color = selected
              ? COLORS.selected
              : p.ref.side === 'ours'
                ? COLORS.route
                : COLORS.routeTheirs
            const marker = selected ? 'selected' : p.ref.side
            const points = p.points.map((point) => at(point.x, point.y))
            return (
              <g
                key={`${p.ref.side}:${p.ref.slot}`}
                data-route={`${p.ref.side}:${p.ref.slot}`}
                aria-hidden="true"
              >
                <polyline
                  points={points.map((point) => `${point.px},${point.py}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={selected ? 4 : 2.5}
                  strokeLinejoin="round"
                  markerEnd={`url(#editor-arrow-${marker})`}
                />
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
                {p.labels.map((text, leg) => {
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
      <g className="editor-players">
        {layout.players.map((p) => {
          const { px, py } = at(p.points[0]?.x ?? 0, p.points[0]?.y ?? 0)
          const selected = isSelected(p)
          const name = label(p, p.ref.slot)
          const ours = p.ref.side === 'ours'
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
              {ours ? (
                <circle
                  cx={px}
                  cy={py}
                  r={radius}
                  fill={COLORS.ours}
                  stroke="#141414"
                  strokeWidth={1.5}
                />
              ) : null}
              <text
                x={px}
                y={py}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={ours ? Math.max(9, radius * 0.8) : Math.max(11, radius)}
                fontWeight={700}
                fontFamily="system-ui, sans-serif"
                fill={ours ? COLORS.oursText : COLORS.theirs}
              >
                {name}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
