import { useId, useState } from 'react'
import type { NoteDraft } from '../data/depthNotes'
import { slotDisplay } from './depthSlots'
import {
  canChangeNote,
  checkNoteBody,
  countText,
  formatNoteDate,
  NOTE_MAX,
  noteLabel,
  previewText,
  SHARE_WARNING,
  summarizeNotes,
  wasEdited,
  type DepthNote,
} from './depthNotes'
import { playerLabel, type RosterPlayer } from './roster'
import type { DepthNotesApi } from './useDepthNotes'
import './depthNotes.css'

/** Count and latest-note preview for a player; opens their notes thread. */
export function NotesControl({
  player,
  notes,
  open,
  onToggle,
}: {
  player: RosterPlayer
  notes: DepthNote[] | undefined
  open: boolean
  onToggle: () => void
}) {
  const summary = summarizeNotes(notes)
  return (
    <button
      type="button"
      className="notes-control"
      aria-expanded={open}
      aria-label={`${countText(summary.count)} on ${player.name}${open ? ', hide' : ', open'}`}
      data-testid={`notes-${player.id}`}
      onClick={onToggle}
    >
      <span className="notes-control-count">
        <NoteIcon />
        {countText(summary.count)}
        {summary.shared > 0 ? (
          <span className="notes-control-shared">· {summary.shared} shared</span>
        ) : null}
      </span>
      {summary.last != null ? (
        <span className="notes-control-preview">{previewText(summary.last.body, 48)}</span>
      ) : null}
    </button>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="notes-icon">
      <path
        d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Small label that says who can read a note. */
export function ShareBadge({ shared }: { shared: boolean }) {
  return (
    <span className="note-badge" data-shared={shared}>
      {noteLabel({ shared })}
    </span>
  )
}

/** A player's notes as a thread, oldest first, with the add form at the bottom. */
export function NotesThread({
  player,
  notes,
  api,
  slot,
  now,
  onClose,
}: {
  player: RosterPlayer
  notes: DepthNote[] | undefined
  api: Pick<DepthNotesApi, 'add' | 'update' | 'remove' | 'me'>
  /** The position the thread was opened from: offered as the note's topic. */
  slot?: string | null
  now?: Date
  onClose?: () => void
}) {
  const list = notes ?? []
  const headingId = useId()
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="notes-thread" aria-labelledby={headingId} data-testid="notes-thread">
      <header className="notes-thread-head">
        <h3 id={headingId}>Notes on {playerLabel(player)}</h3>
        {onClose ? (
          <button type="button" className="btn notes-close" onClick={onClose}>
            Hide
          </button>
        ) : null}
      </header>
      <p className="notes-hint">
        Every coach on the team reads these. The player only sees notes marked{' '}
        <strong>Shared with player</strong>
        {player.userId == null ? ', once they join the app' : ''}.
      </p>
      {list.length === 0 ? <p className="notes-hint">No notes yet.</p> : null}
      <ol className="notes-list">
        {list.map((note) => {
          const mine = canChangeNote(note, api.me)
          if (editing === note.id) {
            return (
              <li key={note.id} className="note" data-shared={note.shared}>
                <NoteForm
                  initial={{ body: note.body, slot: note.slot, shared: note.shared }}
                  slot={note.slot ?? slot ?? null}
                  submitLabel="Save"
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={async (draft) => {
                    const ok = await run(() => api.update(note.id, draft))
                    if (ok) setEditing(null)
                    return ok
                  }}
                />
              </li>
            )
          }
          return (
            <li key={note.id} className="note" data-shared={note.shared} data-testid="note">
              <div className="note-top">
                <span className="note-meta">
                  <strong>{note.authorName}</strong> · {formatNoteDate(note.createdAt, now)}
                  {wasEdited(note) ? ' · edited' : ''}
                  {note.slot != null ? (
                    <span className="note-slot">{slotDisplay(note.slot)}</span>
                  ) : null}
                </span>
                <ShareBadge shared={note.shared} />
              </div>
              <p className="note-body">{note.body}</p>
              {mine ? (
                <div className="note-actions">
                  {confirmDelete === note.id ? (
                    <>
                      <span className="notes-hint">Delete this note?</span>
                      <button
                        type="button"
                        className="playbook-action danger"
                        disabled={busy}
                        onClick={() => {
                          setConfirmDelete(null)
                          void run(() => api.remove(note.id))
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="playbook-action"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="playbook-action"
                        disabled={busy}
                        onClick={() => setEditing(note.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="playbook-action"
                        disabled={busy}
                        aria-label={
                          note.shared
                            ? `Stop sharing this note with ${player.name}`
                            : `Share this note with ${player.name}`
                        }
                        onClick={() =>
                          void run(() => api.update(note.id, { shared: !note.shared }))
                        }
                      >
                        {note.shared ? 'Make private' : 'Share with player'}
                      </button>
                      <button
                        type="button"
                        className="playbook-action"
                        disabled={busy}
                        onClick={() => setConfirmDelete(note.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {editing == null ? (
        <NoteForm
          key={list.length}
          initial={{ body: '', slot: slot ?? null, shared: false }}
          slot={slot ?? null}
          submitLabel="Add note"
          busy={busy}
          onSave={(draft) => run(() => api.add(player.id, draft))}
        />
      ) : null}
    </section>
  )
}

/** Add or edit form. The share toggle is off by default; on, it says the player reads it. */
export function NoteForm({
  initial,
  slot,
  submitLabel,
  busy,
  onSave,
  onCancel,
}: {
  initial: NoteDraft
  /** Position to offer as the topic, besides "General". */
  slot: string | null
  submitLabel: string
  busy: boolean
  onSave: (draft: NoteDraft) => Promise<boolean>
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial.body)
  const [about, setAbout] = useState<string>(initial.slot ?? '')
  const [shared, setShared] = useState(initial.shared)
  const [error, setError] = useState<string | null>(null)
  const ids = useId()
  const left = NOTE_MAX - body.length

  async function submit() {
    const checked = checkNoteBody(body)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    const ok = await onSave({ body: checked.body, slot: about === '' ? null : about, shared })
    if (ok && onCancel == null) {
      setBody('')
      setShared(false)
    }
  }

  return (
    <form
      className="note-form"
      data-testid="note-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label className="note-field" htmlFor={`${ids}-body`}>
        {onCancel ? 'Edit note' : 'New note'}
      </label>
      <textarea
        id={`${ids}-body`}
        className="note-textarea"
        rows={3}
        maxLength={NOTE_MAX}
        placeholder="Where they stand and what moves them up"
        value={body}
        onChange={(event) => {
          setBody(event.target.value)
          setError(null)
        }}
      />
      <div className="note-form-row">
        {slot != null ? (
          <label className="note-about">
            <span>About</span>
            <select value={about} onChange={(event) => setAbout(event.target.value)}>
              <option value="">General</option>
              <option value={slot}>{slotDisplay(slot)}</option>
            </select>
          </label>
        ) : null}
        <span className="note-count" aria-live="polite">
          {left < 100 ? `${left} left` : `${body.length} / ${NOTE_MAX}`}
        </span>
      </div>
      <label className="note-share">
        <input
          type="checkbox"
          role="switch"
          checked={shared}
          onChange={(event) => setShared(event.target.checked)}
        />
        <span>Share with player</span>
      </label>
      {shared ? (
        <p className="note-warning" role="note" data-testid="share-warning">
          {SHARE_WARNING}
        </p>
      ) : (
        <p className="notes-hint">Private: only coaches can read this.</p>
      )}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="note-form-actions">
        <button type="submit" className="playbook-action primary" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="playbook-action" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
