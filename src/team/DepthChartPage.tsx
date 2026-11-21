import { useId, useState, type CSSProperties } from 'react'
import { canEditSide, SIDE_LABEL } from '../auth/sides'
import {
  DEPTH_SLOTS,
  MAX_DEPTH,
  slotSide,
  slotsFor,
  UNIT_LABEL,
  type DepthSlot,
  type Unit,
} from './depthSlots'
import {
  depthCandidates,
  moveInList,
  playerLabel,
  slotsByPlayer,
  type DepthMap,
  type RosterPlayer,
} from './roster'
import { TeamShell } from './TeamShell'
import { useTeamRoster } from './useTeamRoster'
import './team.css'

const RANK = ['Starter', '2nd', '3rd', '4th', '5th', '6th']

export function DepthChartPage() {
  const team = useTeamRoster()
  const { snap, demo, players, depth } = team
  const [unitPick, setUnitPick] = useState<Unit | null>(null)
  const unit: Unit = unitPick ?? snap.side ?? 'offense'
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const byId = new Map(players.map((player) => [player.id, player]))
  const slots = slotsFor(unit)
  const empty = slots.filter((slot) => (depth[slot.id] ?? []).length === 0).length
  const canEdit = (slotId: string) => demo || canEditSide(snap.role, snap.side, slotSide(slotId))
  const current = DEPTH_SLOTS.find((slot) => slot.id === openSlot) ?? null

  return (
    <TeamShell title="Depth chart" snap={snap} demo={demo} wide>
      <div className="roster-filters" role="group" aria-label="Unit">
        {(['offense', 'defense', 'special'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={unit === option}
            onClick={() => {
              setUnitPick(option)
              setOpenSlot(null)
            }}
          >
            {UNIT_LABEL[option]}
          </button>
        ))}
      </div>
      {team.loading ? <p className="loading-line">Loading…</p> : null}
      {team.error ? <p className="auth-error">{team.error}</p> : null}
      {!team.loading ? (
        <p className="depth-summary">
          {empty === 0
            ? 'Every position has a starter.'
            : `${empty} open ${empty === 1 ? 'spot' : 'spots'}.`}{' '}
          Click a position to set who plays there.
          {unit !== 'special' && !canEdit(slots[0]?.id ?? '')
            ? ` View only: the ${SIDE_LABEL[unit].toLowerCase()} coordinator or head coach sets this side.`
            : ''}
        </p>
      ) : null}

      <div className="depth-layout">
        <div
          className="depth-field"
          data-unit={unit}
          aria-label={`${UNIT_LABEL[unit]} depth chart`}
        >
          {unit !== 'special' ? (
            <div className="depth-los" aria-hidden="true" data-unit={unit} />
          ) : null}
          {slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              ids={depth[slot.id] ?? []}
              byId={byId}
              active={openSlot === slot.id}
              onOpen={() => setOpenSlot(openSlot === slot.id ? null : slot.id)}
            />
          ))}
        </div>
        {current != null ? (
          <SlotPanel
            key={current.id}
            slot={current}
            ids={depth[current.id] ?? []}
            depth={depth}
            players={players}
            byId={byId}
            editable={canEdit(current.id)}
            onSave={(ids) => team.saveDepth(current.id, ids)}
            onClose={() => setOpenSlot(null)}
          />
        ) : null}
      </div>
    </TeamShell>
  )
}

function SlotCard({
  slot,
  ids,
  byId,
  active,
  onOpen,
}: {
  slot: DepthSlot
  ids: string[]
  byId: Map<string, RosterPlayer>
  active: boolean
  onOpen: () => void
}) {
  const names = ids.map((id) => byId.get(id)).filter((player) => player != null)
  const starter = names[0]
  const style = { '--col': slot.col, '--row': slot.row } as CSSProperties
  return (
    <button
      type="button"
      className="depth-card"
      style={style}
      data-empty={starter == null}
      aria-pressed={active}
      aria-label={`${slot.name} (${slot.label}): ${starter == null ? 'open' : playerLabel(starter)}${
        names.length > 1 ? `, ${names.length} deep` : ''
      }`}
      data-testid={`depth-${slot.id}`}
      onClick={onOpen}
    >
      <span className="depth-card-top">
        <span className="depth-card-pos">{slot.label}</span>
        {starter?.jersey != null ? <span className="depth-card-num">#{starter.jersey}</span> : null}
      </span>
      <span className="depth-card-name">{starter == null ? 'Open' : starter.name}</span>
      {names[1] != null ? <span className="depth-card-next">2. {names[1].name}</span> : null}
      {names.length > 2 ? <span className="depth-card-more">+{names.length - 2} more</span> : null}
    </button>
  )
}

function SlotPanel({
  slot,
  ids,
  depth,
  players,
  byId,
  editable,
  onSave,
  onClose,
}: {
  slot: DepthSlot
  ids: string[]
  depth: DepthMap
  players: RosterPlayer[]
  byId: Map<string, RosterPlayer>
  editable: boolean
  onSave: (ids: string[]) => Promise<void>
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const headingId = useId()
  const elsewhere = slotsByPlayer(depth)
  const { suggested, others } = depthCandidates(slot, players, ids)

  async function save(next: string[]) {
    setBusy(true)
    setError(null)
    try {
      await onSave(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const also = (id: string) =>
    (elsewhere.get(id) ?? []).filter(
      (entry) => !entry.startsWith(`${slot.id} `) && entry !== slot.id,
    )

  return (
    <section className="depth-panel" aria-labelledby={headingId} data-testid="depth-panel">
      <header className="assign-head">
        <h2 id={headingId}>
          {slot.name} <span className="depth-panel-code">{slot.label}</span>
        </h2>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </header>
      {ids.length === 0 ? <p className="assign-hint">Nobody here yet.</p> : null}
      <ol className="depth-list">
        {ids.map((id, index) => {
          const player = byId.get(id)
          if (player == null) return null
          const extra = also(id)
          return (
            <li key={id} className="depth-row">
              <span className="depth-rank">{RANK[index]}</span>
              <span className="depth-who">
                <strong>{playerLabel(player)}</strong>
                <span className="depth-meta">
                  {[player.position, ...player.altPositions].filter(Boolean).join(' / ') ||
                    'No position'}
                  {extra.length > 0 ? ` · also ${extra.join(', ')}` : ''}
                </span>
              </span>
              {editable ? (
                <span className="depth-moves">
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Move ${player.name} up`}
                    disabled={busy || index === 0}
                    onClick={() => void save(moveInList(ids, index, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Move ${player.name} down`}
                    disabled={busy || index === ids.length - 1}
                    onClick={() => void save(moveInList(ids, index, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Remove ${player.name} from ${slot.label}`}
                    disabled={busy}
                    onClick={() => void save(ids.filter((x) => x !== id))}
                  >
                    ✕
                  </button>
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
      {editable && ids.length < MAX_DEPTH ? (
        <label className="auth-field">
          <span>Add to {slot.label}</span>
          <select
            value=""
            disabled={busy || players.length === 0}
            aria-label={`Add a player at ${slot.name}`}
            onChange={(event) => {
              const id = event.currentTarget.value
              if (id !== '') void save([...ids, id])
            }}
          >
            <option value="">
              {players.length === 0 ? 'Add players on the Roster sheet first' : 'Choose a player…'}
            </option>
            {suggested.length > 0 ? (
              <optgroup label={`Plays ${slot.suggest.join(' / ')}`}>
                {suggested.map((player) => (
                  <PlayerOption key={player.id} player={player} also={also(player.id)} />
                ))}
              </optgroup>
            ) : null}
            {others.length > 0 ? (
              <optgroup label="Everyone else">
                {others.map((player) => (
                  <PlayerOption key={player.id} player={player} also={also(player.id)} />
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      ) : null}
      {!editable ? (
        <p className="assign-hint">
          Only the head coach or this side&apos;s coordinator can change it.
        </p>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function PlayerOption({ player, also }: { player: RosterPlayer; also: string[] }) {
  const pos = player.position ?? '—'
  return (
    <option value={player.id}>
      {playerLabel(player)} ({pos}){also.length > 0 ? ` · ${also.join(', ')}` : ''}
    </option>
  )
}
