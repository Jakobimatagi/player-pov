import { useId, useState, type FormEvent } from 'react'
import {
  assigneeLabel,
  dueFromDate,
  dueLabel,
  POSITION_GROUPS,
  SIDE_GROUPS,
  type Assignment,
} from '../data/assignments'
import type { PositionGroup, StaffSide } from '../data/database.types'
import type { TeamPlayer } from '../data/slots'

/**
 * Assign a playbook folder to position groups or single players. Players see the folder,
 * everything under it, and only the published plays inside.
 */
export function AssignPanel({
  folderName,
  side,
  own,
  inherited,
  players,
  playCount,
  draftCount,
  canEdit,
  onAssign,
  onRemove,
  onClose,
}: {
  folderName: string
  side: StaffSide | null
  /** Assignments on this folder. */
  own: readonly Assignment[]
  /** Assignments on folders above it, which also reach this one. */
  inherited: readonly (Assignment & { from: string })[]
  players: readonly TeamPlayer[]
  playCount: number
  draftCount: number
  canEdit: boolean
  onAssign: (input: {
    group: PositionGroup | null
    userId: string | null
    dueAt: string | null
  }) => Promise<void>
  onRemove: (assignment: Assignment) => Promise<void>
  onClose: () => void
}) {
  const [mode, setMode] = useState<'group' | 'player'>('group')
  const suggested = side == null ? [] : SIDE_GROUPS[side]
  const groups = [
    ...POSITION_GROUPS.filter((group) => suggested.includes(group.id)),
    ...POSITION_GROUPS.filter((group) => !suggested.includes(group.id)),
  ]
  const [group, setGroup] = useState<PositionGroup>(groups[0]?.id ?? 'QB')
  const [userId, setUserId] = useState<string>('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const headingId = useId()

  const taken = (candidate: { group: PositionGroup | null; userId: string | null }) =>
    own.some(
      (item) =>
        (candidate.group != null && item.group === candidate.group) ||
        (candidate.userId != null && item.userId === candidate.userId),
    )

  async function submit(event: FormEvent) {
    event.preventDefault()
    const pick =
      mode === 'group' ? { group, userId: null } : { group: null, userId: userId || null }
    if (pick.group == null && pick.userId == null) {
      setNote({ kind: 'error', text: 'Pick a player.' })
      return
    }
    if (taken(pick)) {
      setNote({ kind: 'error', text: 'Already assigned.' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      await onAssign({ ...pick, dueAt: due === '' ? null : dueFromDate(due) })
      setNote({
        kind: 'ok',
        text: `Assigned to ${assigneeLabel({ id: '', playbookId: '', dueAt: null, ...pick }, players)}`,
      })
      setDue('')
    } catch (error) {
      setNote({ kind: 'error', text: error instanceof Error ? error.message : 'Could not assign' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(assignment: Assignment) {
    setNote(null)
    try {
      await onRemove(assignment)
    } catch (error) {
      setNote({ kind: 'error', text: error instanceof Error ? error.message : 'Could not remove' })
    }
  }

  return (
    <section
      className="folder-panel assign-folder"
      aria-labelledby={headingId}
      data-testid="assign-panel"
    >
      <h2 id={headingId}>Assign {folderName}</h2>
      <p className="folder-hint">
        Players see this folder, every folder inside it, and the published plays in them.
        {draftCount > 0
          ? ` ${draftCount} of ${playCount} play${playCount === 1 ? ' is a draft' : 's are drafts'} and stay hidden until published.`
          : playCount > 0
            ? ` All ${playCount} play${playCount === 1 ? ' is' : 's are'} published.`
            : ' It has no plays yet.'}
      </p>

      {own.length === 0 && inherited.length === 0 ? (
        <p className="assign-none">Not assigned to anyone yet.</p>
      ) : (
        <ul className="assign-list" aria-label="Assigned to">
          {own.map((item) => (
            <li key={item.id} className="assign-item">
              <span className="assign-who">{assigneeLabel(item, players)}</span>
              <span className="assign-due">
                {item.dueAt != null ? `Due ${dueLabel(item.dueAt)}` : 'No due date'}
              </span>
              {canEdit ? (
                <button type="button" className="playbook-action" onClick={() => void remove(item)}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
          {inherited.map((item) => (
            <li key={item.id} className="assign-item" data-inherited="true">
              <span className="assign-who">{assigneeLabel(item, players)}</span>
              <span className="assign-due">Through {item.from}</span>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form className="assign-form" onSubmit={(event) => void submit(event)}>
          <div className="assign-mode" role="radiogroup" aria-label="Assign to">
            <label>
              <input
                type="radio"
                name="assign-mode"
                checked={mode === 'group'}
                onChange={() => setMode('group')}
              />
              Position group
            </label>
            <label>
              <input
                type="radio"
                name="assign-mode"
                checked={mode === 'player'}
                onChange={() => setMode('player')}
              />
              One player
            </label>
          </div>
          {mode === 'group' ? (
            <label className="auth-field">
              <span>Group</span>
              <select
                value={group}
                onChange={(event) => setGroup(event.currentTarget.value as PositionGroup)}
              >
                {groups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({item.id})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="auth-field">
              <span>Player</span>
              <select value={userId} onChange={(event) => setUserId(event.currentTarget.value)}>
                <option value="">Pick a player</option>
                {players.map((player) => (
                  <option key={player.userId} value={player.userId}>
                    {player.name}
                    {player.position != null ? ` · ${player.position}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="auth-field">
            <span>Due (optional)</span>
            <input
              type="date"
              value={due}
              onChange={(event) => setDue(event.currentTarget.value)}
            />
          </label>
          <div className="playbook-actions assign-actions">
            <button type="submit" className="playbook-action primary" disabled={busy}>
              Assign
            </button>
            <button type="button" className="playbook-action" onClick={onClose}>
              Done
            </button>
          </div>
        </form>
      ) : (
        <div className="playbook-actions assign-actions">
          <p className="folder-hint">
            Only the head coach or this book’s coordinator can change who has it.
          </p>
          <button type="button" className="playbook-action" onClick={onClose}>
            Done
          </button>
        </div>
      )}
      {note != null ? (
        <p
          className={note.kind === 'error' ? 'auth-error' : 'playbook-success'}
          role={note.kind === 'error' ? 'alert' : 'status'}
        >
          {note.text}
        </p>
      ) : null}
    </section>
  )
}
