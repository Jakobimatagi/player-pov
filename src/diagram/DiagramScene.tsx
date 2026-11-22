import type Konva from 'konva'
import { memo } from 'react'
import { Circle, Group, Layer, Line, Rect, RegularPolygon, Stage, Text, Wedge } from 'react-konva'
import { COLOR_HEX, lineHex, onHex } from './colors'
import { fieldView, lineShape, LOS_Y, tokenRadius } from './geometry'
import type { Diagram, DLine, DNote, DPlayer, FieldPreset, LineType, Pt } from './types'

const SELECT = '#ffd84a'
const GRASS = '#2f6b35'

export interface Ghost {
  from: Pt
  to: Pt
  type: LineType
  color: DLine['color']
}

export interface DiagramSceneProps {
  diagram: Diagram
  width: number
  height: number
  preset?: FieldPreset | null
  /** False for thumbnails: the same scene, drawn at any size, with no events. */
  interactive?: boolean
  selection?: readonly string[]
  /** The line being dragged out right now, in 0..1. */
  ghost?: Ghost | null
  /** Area-select rectangle corners, or lasso points, in 0..1. */
  marquee?: { a: Pt; b: Pt } | null
  lasso?: readonly Pt[] | null
  /** Ids hidden while an editor input sits over them. */
  hidden?: string | null
  onStagePoint?: (phase: 'down' | 'move' | 'up', at: Pt, event: PointerEvent | MouseEvent) => void
  onItemDown?: (id: string, at: Pt, event: PointerEvent | MouseEvent) => void
  onItemDouble?: (id: string) => void
}

function Token({
  player,
  w,
  h,
  selected,
  hidden,
}: {
  player: DPlayer
  w: number
  h: number
  selected: boolean
  hidden: boolean
}) {
  const r = tokenRadius(w)
  const x = player.x * w
  const y = player.y * h
  const fill = COLOR_HEX[player.color]
  const stroke = '#141414'
  const split = player.fillStyle === 'split'
  const label = player.label
  if (player.shape === 'text') {
    return (
      <Group id={player.id} x={x} y={y} opacity={hidden ? 0 : 1}>
        <Text
          text={label ?? 'Ab'}
          fontSize={Math.max(8, r * 1.5)}
          fontStyle="bold"
          fill="#ffffff"
          stroke="#141414"
          strokeWidth={0.6}
          offsetX={r * 1.5}
          offsetY={r * 0.8}
          width={r * 3}
          align="center"
        />
        {selected ? (
          <Rect
            x={-r * 1.6}
            y={-r * 1}
            width={r * 3.2}
            height={r * 2}
            stroke={SELECT}
            strokeWidth={2}
            cornerRadius={4}
          />
        ) : null}
      </Group>
    )
  }
  const body =
    player.shape === 'triangle' ? (
      <RegularPolygon
        sides={3}
        radius={r * 1.2}
        y={r * 0.15}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.4}
      />
    ) : player.square ? (
      <>
        <Rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          fill={split ? '#f4f1ea' : fill}
          stroke={stroke}
          strokeWidth={1.4}
        />
        {split ? <Rect x={-r} y={-r} width={r} height={r * 2} fill={fill} /> : null}
      </>
    ) : (
      <>
        <Circle radius={r} fill={split ? '#f4f1ea' : fill} stroke={stroke} strokeWidth={1.4} />
        {split ? <Wedge radius={r} angle={180} rotation={90} fill={fill} /> : null}
        <Circle radius={r} stroke={stroke} strokeWidth={1.4} />
      </>
    )
  return (
    <Group id={player.id} x={x} y={y} opacity={hidden ? 0 : 1}>
      {selected ? <Circle radius={r + 4} stroke={SELECT} strokeWidth={2.5} /> : null}
      {body}
      {label != null && label.length > 0 ? (
        <Text
          text={label}
          width={r * 2}
          height={r * 2}
          offsetX={r}
          offsetY={r}
          align="center"
          verticalAlign="middle"
          fontSize={Math.max(6, r * 0.95)}
          fontStyle="bold"
          fill={split ? '#141414' : onHex(player.color)}
          listening={false}
        />
      ) : null}
    </Group>
  )
}

function Note({
  note,
  w,
  h,
  selected,
  hidden,
}: {
  note: DNote
  w: number
  h: number
  selected: boolean
  hidden: boolean
}) {
  const size = Math.max(8, w * 0.026)
  const boxW = Math.min(w * 0.4, Math.max(size * 5, note.text.length * size * 0.62 + size * 1.4))
  return (
    <Group id={note.id} x={note.x * w} y={note.y * h} opacity={hidden ? 0 : 1}>
      <Rect
        width={boxW}
        height={size * 2.1}
        fill="#fff3a8"
        stroke={selected ? SELECT : '#8a7a2b'}
        strokeWidth={selected ? 2.5 : 1}
        cornerRadius={3}
      />
      <Text
        text={note.text}
        x={size * 0.6}
        y={size * 0.55}
        width={boxW - size * 1.2}
        fontSize={size}
        fill="#2b2400"
        listening={false}
      />
    </Group>
  )
}

function Strokes({
  type,
  from,
  to,
  color,
  unit,
  selected,
  ghost,
}: {
  type: LineType
  from: Pt
  to: Pt
  color: string
  unit: number
  selected: boolean
  ghost?: boolean
}) {
  const shape = lineShape(type, from, to, unit)
  const width = Math.max(1.6, unit * (selected ? 0.5 : 0.34))
  const stroke = ghost ? SELECT : selected ? SELECT : color
  return (
    <>
      {shape.parts.map((part, i) => (
        <Line
          key={i}
          points={part.points}
          stroke={stroke}
          strokeWidth={width}
          dash={part.dash}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={Math.max(14, unit * 2)}
        />
      ))}
      {shape.arrow ? (
        <Line points={shape.arrow} closed fill={stroke} stroke={stroke} strokeWidth={1} />
      ) : null}
      {shape.dot ? (
        <Circle x={shape.dot.x} y={shape.dot.y} radius={shape.dot.r} fill={stroke} />
      ) : null}
    </>
  )
}

/**
 * The whole diagram as one Konva scene. Thumbnails render this same component with
 * `interactive={false}` at a smaller size, so there is one drawing path.
 */
export const DiagramScene = memo(function DiagramScene({
  diagram,
  width,
  height,
  preset = null,
  interactive = true,
  selection = [],
  ghost = null,
  marquee = null,
  lasso = null,
  hidden = null,
  onStagePoint,
  onItemDown,
  onItemDouble,
}: DiagramSceneProps) {
  const field = fieldView(preset)
  const unit = tokenRadius(width)
  const picked = new Set(selection)
  const norm = (stage: Konva.Stage | null): Pt | null => {
    const p = stage?.getPointerPosition()
    return p == null ? null : { x: p.x / width, y: p.y / height }
  }
  const stagePhase =
    (phase: 'down' | 'move' | 'up') => (e: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
      const at = norm(e.target.getStage())
      if (at != null) onStagePoint?.(phase, at, e.evt)
    }
  // The item under the pointer is the nearest ancestor that carries one of our ids.
  const itemDown = (e: Konva.KonvaEventObject<PointerEvent | MouseEvent>, id: string) => {
    e.cancelBubble = true
    const at = norm(e.target.getStage())
    if (at != null) onItemDown?.(id, at, e.evt)
  }
  const playersById = new Map(diagram.players.map((p) => [p.id, p]))

  return (
    <Stage
      width={width}
      height={height}
      listening={interactive}
      onPointerDown={stagePhase('down')}
      onPointerMove={stagePhase('move')}
      onPointerUp={stagePhase('up')}
      style={{ touchAction: 'none', display: 'block' }}
    >
      <Layer listening={false}>
        <Rect width={width} height={height} fill={GRASS} />
        {field.endZones.map((zone, i) => (
          <Rect
            key={i}
            y={zone.y0 * height}
            width={width}
            height={(zone.y1 - zone.y0) * height}
            fill="#244f29"
          />
        ))}
        {field.marks.map((mark) => (
          <Group key={mark.y}>
            <Line
              points={[0, mark.y * height, width, mark.y * height]}
              stroke="#ffffff"
              opacity={mark.kind === 'goal' ? 0.9 : 0.28}
              strokeWidth={mark.kind === 'goal' ? 2.5 : 1}
            />
            {mark.label != null && width > 160 ? (
              <>
                <Text
                  text={String(mark.label)}
                  x={width * 0.04}
                  y={mark.y * height - unit * 0.7}
                  fontSize={unit * 1.5}
                  fontStyle="bold"
                  fill="#ffffff"
                  opacity={0.3}
                />
                <Text
                  text={String(mark.label)}
                  x={width * 0.96 - unit * 1.6}
                  y={mark.y * height - unit * 0.7}
                  fontSize={unit * 1.5}
                  fontStyle="bold"
                  fill="#ffffff"
                  opacity={0.3}
                />
              </>
            ) : null}
          </Group>
        ))}
        <Line
          points={[0, LOS_Y * height, width, LOS_Y * height]}
          stroke="#4aa3ff"
          strokeWidth={interactive ? 3 : 2}
        />
      </Layer>
      <Layer>
        {diagram.lines.map((line) => {
          const player = playersById.get(line.playerId)
          const end = line.points[line.points.length - 1]
          if (player == null || end == null) return null
          return (
            <Group key={line.id} id={line.id} onPointerDown={(e) => itemDown(e, line.id)}>
              <Strokes
                type={line.type}
                from={{ x: player.x * width, y: player.y * height }}
                to={{ x: end.x * width, y: end.y * height }}
                color={lineHex(line.color)}
                unit={unit}
                selected={picked.has(line.id)}
              />
            </Group>
          )
        })}
        {ghost ? (
          <Strokes
            type={ghost.type}
            from={{ x: ghost.from.x * width, y: ghost.from.y * height }}
            to={{ x: ghost.to.x * width, y: ghost.to.y * height }}
            color={lineHex(ghost.color)}
            unit={unit}
            selected={false}
            ghost
          />
        ) : null}
      </Layer>
      <Layer>
        {diagram.players.map((player) => (
          <Group
            key={player.id}
            onPointerDown={(e) => itemDown(e, player.id)}
            onDblClick={() => onItemDouble?.(player.id)}
            onDblTap={() => onItemDouble?.(player.id)}
          >
            <Token
              player={player}
              w={width}
              h={height}
              selected={picked.has(player.id)}
              hidden={hidden === player.id}
            />
          </Group>
        ))}
        {diagram.notes.map((note) => (
          <Group
            key={note.id}
            onPointerDown={(e) => itemDown(e, note.id)}
            onDblClick={() => onItemDouble?.(note.id)}
            onDblTap={() => onItemDouble?.(note.id)}
          >
            <Note
              note={note}
              w={width}
              h={height}
              selected={picked.has(note.id)}
              hidden={hidden === note.id}
            />
          </Group>
        ))}
      </Layer>
      <Layer listening={false}>
        {marquee ? (
          <Rect
            x={Math.min(marquee.a.x, marquee.b.x) * width}
            y={Math.min(marquee.a.y, marquee.b.y) * height}
            width={Math.abs(marquee.b.x - marquee.a.x) * width}
            height={Math.abs(marquee.b.y - marquee.a.y) * height}
            stroke={SELECT}
            dash={[6, 4]}
            fill="rgba(255,216,74,0.12)"
          />
        ) : null}
        {lasso && lasso.length > 1 ? (
          <Line
            points={lasso.flatMap((p) => [p.x * width, p.y * height])}
            stroke={SELECT}
            dash={[6, 4]}
            closed
            fill="rgba(255,216,74,0.12)"
          />
        ) : null}
      </Layer>
    </Stage>
  )
})
