import type { KeyboardEvent } from 'react'
import type { BoardLayout, BoardPlayer } from './board'

export type SlotStatus = 'complete' | 'incomplete' | 'optional'

/**
 * The play board: where each player lines up and where they go after the snap. Offense
 * moves up. Tapping a player picks them; the page shows that position's A's and R's.
 */
export function PlayBoard({
  layout,
  name,
  selected,
  mine,
  status,
  showStatus,
  onSelect,
}: {
  layout: BoardLayout
  name: string
  selected: string | null
  /** The viewing player's own position, marked "You". */
  mine: string | null
  status: (slot: string) => SlotStatus
  /** Coaches see a green or red badge on each of our positions. */
  showStatus: boolean
  onSelect: (slot: string) => void
}) {
  const [left, right] = layout.sidelines
  const focus = selected != null
  const ordered = [...layout.players].sort((a, b) => rank(a, selected) - rank(b, selected))

  return (
    <svg
      className="play-board"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="group"
      aria-label={`Play board: ${name}. Offense moving up.`}
      data-testid="play-board"
    >
      <defs>
        {(['ours', 'theirs', 'picked'] as const).map((kind) => (
          <marker
            key={kind}
            id={`board-arrow-${kind}`}
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" className={`board-arrow board-arrow-${kind}`} />
          </marker>
        ))}
      </defs>
      <rect className="board-grass" x="0" y="0" width={layout.width} height={layout.height} />
      <line className="board-sideline" x1={left} y1="0" x2={left} y2={layout.height} />
      <line className="board-sideline" x1={right} y1="0" x2={right} y2={layout.height} />
      {layout.yardLines.map((line) => (
        <g key={line.y}>
          <line className="board-yard" x1={left} y1={line.y} x2={right} y2={line.y} />
          {line.number != null ? (
            <>
              <text className="board-number" x={left + 4} y={line.y + 0.7}>
                {line.number}
              </text>
              <text className="board-number" x={right - 4} y={line.y + 0.7}>
                {line.number}
              </text>
            </>
          ) : null}
        </g>
      ))}
      {layout.ticks.map((y) =>
        layout.hashes.map((x) => (
          <line key={`${x}:${y}`} className="board-hash" x1={x - 0.5} y1={y} x2={x + 0.5} y2={y} />
        )),
      )}
      <line
        className="board-los"
        x1={left}
        y1={layout.los}
        x2={right}
        y2={layout.los}
        aria-hidden="true"
      />

      {ordered.map((player) => {
        if (player.path.length < 2) return null
        const picked = player.id === selected
        const kind = picked ? 'picked' : player.ours ? 'ours' : 'theirs'
        return (
          <polyline
            key={`route-${player.id}`}
            className={`board-route board-route-${kind}`}
            data-dim={focus && !picked ? 'true' : undefined}
            points={player.path.map((p) => `${p.x},${p.y}`).join(' ')}
            markerEnd={`url(#board-arrow-${kind})`}
          />
        )
      })}

      <ellipse className="board-ball" cx={layout.ball.x} cy={layout.ball.y} rx="0.35" ry="0.55" />

      {ordered.map((player) => (
        <Chip
          key={player.id}
          player={player}
          picked={player.id === selected}
          mine={player.id === mine}
          status={status(player.id)}
          showStatus={showStatus}
          onSelect={onSelect}
        />
      ))}
    </svg>
  )
}

/** Draw the picked player last so its ring sits on top. */
function rank(player: BoardPlayer, selected: string | null): number {
  if (player.id === selected) return 2
  return player.ours ? 1 : 0
}

const STATUS_WORDS: Record<SlotStatus, string> = {
  complete: 'all six answered',
  incomplete: 'missing answers',
  optional: 'scout look',
}

function Chip({
  player,
  picked,
  mine,
  status,
  showStatus,
  onSelect,
}: {
  player: BoardPlayer
  picked: boolean
  mine: boolean
  status: SlotStatus
  showStatus: boolean
  onSelect: (slot: string) => void
}) {
  const { x, y } = player.align
  const onKey = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(player.id)
    }
  }
  const words = [player.label, mine ? 'you' : null, showStatus ? STATUS_WORDS[status] : null]
    .filter((part) => part != null)
    .join(', ')
  return (
    <g
      className="board-chip"
      data-side={player.ours ? 'ours' : 'theirs'}
      data-picked={picked ? 'true' : undefined}
      data-testid={`board-${player.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      aria-label={words}
      onClick={() => onSelect(player.id)}
      onKeyDown={onKey}
    >
      {/* Generous invisible hit area for fingers. */}
      <circle className="board-hit" cx={x} cy={y} r="1.6" />
      {picked ? <circle className="board-ring" cx={x} cy={y} r="1.15" /> : null}
      {player.ours ? (
        <circle className="board-token" cx={x} cy={y} r="0.8" />
      ) : (
        <rect className="board-token" x={x - 0.75} y={y - 0.75} width="1.5" height="1.5" rx="0.3" />
      )}
      <text className="board-mark" x={x} y={y} dominantBaseline="central" textAnchor="middle">
        {player.mark}
      </text>
      {showStatus && player.ours ? (
        <g className="board-badge" data-status={status}>
          <circle cx={x + 0.72} cy={y - 0.72} r="0.42" />
          <text x={x + 0.72} y={y - 0.72} dominantBaseline="central" textAnchor="middle">
            {status === 'complete' ? '✓' : '!'}
          </text>
        </g>
      ) : null}
      {mine ? (
        <text className="board-you" x={x} y={y + 1.75} textAnchor="middle">
          YOU
        </text>
      ) : null}
    </g>
  )
}
