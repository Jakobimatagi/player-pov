import { useId, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { canEditSide, SIDE_LABEL } from '../auth/sides'
import {
  DEPTH_SLOTS,
  GROUP_LABEL,
  groupOf,
  MAX_DEPTH,
  slotSide,
  slotsFor,
  SPECIAL_UNITS,
  UNIT_LABEL,
  unitColumns,
  slotDisplay,
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
import { NotesControl, NotesThread } from './NotesThread'
import { rankLabel, type DepthNote } from './depthNotes'
import { TeamShell } from './TeamShell'
import { useDepthNotes, type DepthNotesApi } from './useDepthNotes'
import { useTeamRoster } from './useTeamRoster'
import './team.css'

const RANK = ['Starter', '2nd', '3rd', '4th', '5th', '6th']

export function DepthChartPage() {
  const team = useTeamRoster()
  const { snap, demo, players, depth } = team
  const notes = useDepthNotes(snap, demo)
  const [params, setParams] = useSearchParams()
  const [unitPick, setUnitPick] = useState<Unit | null>(null)
  const unit: Unit = unitPick ?? (snap.side === 'special' ? 'ko' : (snap.side ?? 'offense'))
  const group = groupOf(unit)
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [copyNote, setCopyNote] = useState<string | null>(null)
  const byId = new Map(players.map((player) => [player.id, player]))
  const slots = slotsFor(unit)
  const empty = slots.filter((slot) => (depth[slot.id] ?? []).length === 0).length
  const canEdit = (slotId: string) =>
    demo || canEditSide(snap.role, snap.side, slotSide(slotId), snap.specialCoordinator)
  const editable = slots[0] != null && canEdit(slots[0].id)
  const current = DEPTH_SLOTS.find((slot) => slot.id === openSlot) ?? null
  const receiving = unit === 'defense' || unit === 'kr' || unit === 'pr'
  const fieldStyle = { '--cols': unitColumns(unit) } as CSSProperties
  // Deep link from the roster sheet or activity dashboard: ?player=<roster id> or ?user=<account id>.
  const wantPlayer = params.get('player')
  const wantUser = params.get('user')
  const focus =
    current == null && (wantPlayer != null || wantUser != null)
      ? (players.find(
          (player) =>
            (wantPlayer != null && player.id === wantPlayer) ||
            (wantUser != null && player.userId === wantUser),
        ) ?? null)
      : null
  const clearFocus = () => {
    const next = new URLSearchParams(params)
    next.delete('player')
    next.delete('user')
    setParams(next, { replace: true })
  }

  const pick = (next: Unit) => {
    setUnitPick(next)
    setOpenSlot(null)
    setCopyNote(null)
  }

  async function copyFieldGoal() {
    setCopyNote(null)
    try {
      for (const slot of slotsFor('pat')) {
        const twin = slot.id.replace(/^PAT_/, 'FG_')
        await team.saveDepth(slot.id, depth[twin] ?? [])
      }
      setCopyNote('PAT unit copied from field goal.')
    } catch (err) {
      setCopyNote(err instanceof Error ? err.message : 'Could not copy')
    }
  }

  return (
    <TeamShell title="Depth chart" snap={snap} demo={demo} wide>
      <div className="roster-filters" role="group" aria-label="Unit">
        {(['offense', 'defense', 'special'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={group === option}
            onClick={() => pick(option === 'special' ? 'ko' : option)}
          >
            {GROUP_LABEL[option]}
          </button>
        ))}
      </div>
      {group === 'special' ? (
        <div className="roster-filters depth-subunits" role="group" aria-label="Special teams unit">
          {SPECIAL_UNITS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={unit === option}
              onClick={() => pick(option)}
            >
              {UNIT_LABEL[option]}
            </button>
          ))}
        </div>
      ) : null}
      {team.loading ? <p className="loading-line">Loading…</p> : null}
      {team.error ? <p className="auth-error">{team.error}</p> : null}
      {notes.error ? <p className="auth-error">{notes.error}</p> : null}
      {!team.loading ? (
        <p className="depth-summary">
          {empty === 0
            ? 'Every position has a starter.'
            : `${empty} open ${empty === 1 ? 'spot' : 'spots'}.`}{' '}
          Click a position to set who plays there.
          {!editable
            ? ` View only: the ${SIDE_LABEL[group].toLowerCase()} coordinator or head coach sets this.`
            : ''}
        </p>
      ) : null}
      {unit === 'pat' && editable ? (
        <div className="depth-actions">
          <button type="button" className="playbook-action" onClick={() => void copyFieldGoal()}>
            Copy from field goal
          </button>
          {copyNote ? <span role="status">{copyNote}</span> : null}
        </div>
      ) : null}

      <div className="depth-layout">
        <div
          className="depth-field"
          data-unit={unit}
          style={fieldStyle}
          aria-label={`${UNIT_LABEL[unit]} depth chart`}
        >
          <div className="depth-los" aria-hidden="true" data-dir={receiving ? 'down' : 'up'} />
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
            notes={notes}
          />
        ) : null}
        {focus != null ? (
          <PlayerNotesPanel
            key={focus.id}
            player={focus}
            depth={depth}
            notes={notes}
            onClose={clearFocus}
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
  notes,
}: {
  slot: DepthSlot
  ids: string[]
  depth: DepthMap
  players: RosterPlayer[]
  byId: Map<string, RosterPlayer>
  editable: boolean
  onSave: (ids: string[]) => Promise<void>
  onClose: () => void
  notes: DepthNotesApi
}) {
  const [error, setError] = useState<string | null>(null)
  const [notesFor, setNotesFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const headingId = useId()
  const elsewhere = slotsByPlayer(depth, slotDisplay)
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

  const here = slotDisplay(slot.id)
  const also = (id: string) =>
    (elsewhere.get(id) ?? []).filter((entry) => entry !== here && !entry.startsWith(`${here} (`))

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
          const playerNotes: DepthNote[] | undefined = notes.byPlayer.get(id)
          return [
            <li key={id} className="depth-row">
              <span className="depth-rank">{RANK[index]}</span>
              <span className="depth-who">
                <strong>{playerLabel(player)}</strong>
                <span className="depth-meta">
                  {[player.position, ...player.altPositions].filter(Boolean).join(' / ') ||
                    'No position'}
                  {extra.length > 0 ? ` · also ${extra.join(', ')}` : ''}
                </span>
                <NotesControl
                  player={player}
                  notes={playerNotes}
                  open={notesFor === id}
                  onToggle={() => setNotesFor(notesFor === id ? null : id)}
                />
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
            </li>,
            notesFor === id ? (
              <li key={`${id}-notes`} className="depth-thread">
                <NotesThread
                  player={player}
                  notes={playerNotes}
                  api={notes}
                  slot={slot.id}
                  onClose={() => setNotesFor(null)}
                />
              </li>
            ) : null,
          ]
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

/** One player's spots and notes, opened from a link (?player= or ?user=) with no position picked. */
function PlayerNotesPanel({
  player,
  depth,
  notes,
  onClose,
}: {
  player: RosterPlayer
  depth: DepthMap
  notes: DepthNotesApi
  onClose: () => void
}) {
  const headingId = useId()
  const spots = Object.entries(depth)
    .flatMap(([slotId, ids]) => {
      const index = ids.indexOf(player.id)
      return index < 0 ? [] : [`${slotDisplay(slotId)}, ${rankLabel(index + 1)}`]
    })
    .sort()
  return (
    <section className="depth-panel" aria-labelledby={headingId} data-testid="player-notes-panel">
      <header className="assign-head">
        <h2 id={headingId}>{playerLabel(player)}</h2>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="assign-hint">
        {spots.length === 0 ? 'Not on the depth chart yet.' : spots.join(' · ')}
      </p>
      <NotesThread player={player} notes={notes.byPlayer.get(player.id)} api={notes} />
    </section>
  )
}
