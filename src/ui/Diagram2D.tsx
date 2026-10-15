import { useEffect, useState } from 'react'

const FIELD_LEN = 120
const FIELD_WID = 53.333

interface Waypoint {
  x: number
  y: number
}

interface DiagramPlayer {
  id: string
  team: 'offense' | 'defense'
  waypoints: Waypoint[]
}

interface DiagramData {
  name: string
  players: DiagramPlayer[]
}

function isDiagram(value: unknown): value is DiagramData {
  if (typeof value !== 'object' || value == null || !('players' in value)) return false
  const players = (value as { players: unknown }).players
  return Array.isArray(players)
}

/** Static top-down X's and O's with route polylines. Used when WebGL is unavailable. */
export function Diagram2D() {
  const [data, setData] = useState<DiagramData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/plays/trips-right-vs-cover2.json')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: unknown = await res.json()
        if (!isDiagram(json)) throw new Error('Play has no players')
        const meta = (json as { meta?: { name?: unknown } }).meta
        const name = meta != null && typeof meta.name === 'string' ? meta.name : 'Play'
        if (!cancelled) setData({ name, players: json.players })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load play')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="diagram-card" data-testid="diagram-2d">
      <h2>2D fallback preview</h2>
      {error != null && <p>{error}</p>}
      <svg
        viewBox={`-4 -4 ${FIELD_LEN + 8} ${FIELD_WID + 8}`}
        width="100%"
        role="img"
        aria-label="Top-down diagram of the play at the snap"
      >
        <rect x={0} y={0} width={FIELD_LEN} height={FIELD_WID} fill="#1d6b32" />
        <rect x={0} y={0} width={10} height={FIELD_WID} fill="#164e26" />
        <rect x={110} y={0} width={10} height={FIELD_WID} fill="#164e26" />
        {Array.from({ length: 21 }, (_, i) => {
          const x = 10 + i * 5
          return (
            <line key={x} x1={x} y1={0} x2={x} y2={FIELD_WID} stroke="#ffffff" strokeWidth={0.15} />
          )
        })}
        {data?.players.map((player) => {
          const first = player.waypoints[0]
          if (first == null) return null
          const points = player.waypoints.map((wp) => `${wp.x},${FIELD_WID - wp.y}`).join(' ')
          const cx = first.x
          const cy = FIELD_WID - first.y
          const offense = player.team === 'offense'
          return (
            <g key={player.id}>
              <polyline
                points={points}
                fill="none"
                stroke={offense ? '#ffb3c1' : '#d0d0d0'}
                strokeWidth={0.35}
              />
              {offense ? (
                <circle cx={cx} cy={cy} r={1.1} fill="none" stroke="#c8102e" strokeWidth={0.45} />
              ) : (
                <g stroke="#f2f2f2" strokeWidth={0.4}>
                  <line x1={cx - 0.9} y1={cy - 0.9} x2={cx + 0.9} y2={cy + 0.9} />
                  <line x1={cx - 0.9} y1={cy + 0.9} x2={cx + 0.9} y2={cy - 0.9} />
                </g>
              )}
            </g>
          )
        })}
      </svg>
      {data != null && <p>{data.name}</p>}
    </div>
  )
}
