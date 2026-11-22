import { useId, useState, type FormEvent } from 'react'
import { SIDE_LABEL } from '../auth/sides'
import { dueFromDate, dueLabel, POSITION_GROUPS } from '../data/assignments'
import type { PositionGroup, ScoutTaskStatus, StaffSide } from '../data/database.types'
import type { StaffMember } from '../data/scoutTasks'
import type { Folder } from './folders'
import {
  DEFAULT_PACK_SIDE,
  dueState,
  SCOUT_SECTIONS,
  SECTION_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  thisWeek,
  type PackInput,
  taskAssigneeLabel,
  type ScoutTask,
  type SectionState,
} from './scoutPacks'
import './scoutPacks.css'

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

function staffName(staff: readonly StaffMember[], userId: string | null): string | null {
  if (userId == null) return null
  return staff.find((member) => member.userId === userId)?.name ?? 'A coach'
}

/** New scout pack: opponent, week, studying side, and the template sections. */
export function NewScoutPackForm(props: {
  sides: readonly (StaffSide | null)[]
  onCreate: (input: PackInput) => Promise<void>
  onCancel: () => void
}) {
  const [opponent, setOpponent] = useState('')
  const [day, setDay] = useState(() => thisWeek(new Date()))
  const [side, setSide] = useState<StaffSide | null>(
    props.sides.includes(DEFAULT_PACK_SIDE) ? DEFAULT_PACK_SIDE : (props.sides[0] ?? null),
  )
  const [picked, setPicked] = useState<string[]>([...SCOUT_SECTIONS])
  const [extra, setExtra] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sideName = useId()

  function toggle(name: string) {
    setPicked((rows) =>
      rows.includes(name) ? rows.filter((row) => row !== name) : [...rows, name],
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const sections = (SCOUT_SECTIONS as readonly string[])
        .filter((name) => picked.includes(name))
        .concat(
          extra
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0),
        )
      await props.onCreate({ opponent, day, side, sections })
    } catch (caught) {
      setError(message(caught, 'Could not make the scout pack'))
      setBusy(false)
    }
  }

  return (
    <form
      className="folder-panel scout-pack-form"
      aria-label="New scout pack"
      onSubmit={(event) => void submit(event)}
    >
      <h2>New scout pack</h2>
      <p className="folder-hint">
        Files the pack in Opponents › team › week. A new week makes a new pack next to the old one.
      </p>
      <label className="auth-field">
        <span>Opponent</span>
        <input
          value={opponent}
          placeholder="e.g. Lincoln High"
          autoFocus
          onChange={(event) => setOpponent(event.target.value)}
        />
      </label>
      <label className="auth-field">
        <span>Week of</span>
        <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </label>
      {props.sides.length > 1 ? (
        <fieldset className="kind-pick">
          <legend>Studied by</legend>
          {props.sides.map((option) => (
            <label key={option ?? 'shared'} className="kind-option">
              <input
                type="radio"
                name={sideName}
                checked={side === option}
                onChange={() => setSide(option)}
              />
              {option == null ? 'Shared' : SIDE_LABEL[option]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="kind-pick">
        <legend>Sections</legend>
        {SCOUT_SECTIONS.map((name) => (
          <label key={name} className="kind-option">
            <input type="checkbox" checked={picked.includes(name)} onChange={() => toggle(name)} />
            {name}
          </label>
        ))}
      </fieldset>
      <label className="auth-field">
        <span>More sections (optional, comma separated)</span>
        <input
          value={extra}
          placeholder="e.g. Red Zone, Two Minute"
          onChange={(event) => setExtra(event.target.value)}
        />
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="playbook-actions">
        <button type="submit" className="playbook-action primary" disabled={busy}>
          Create pack
        </button>
        <button type="button" className="playbook-action" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export interface DelegateInput {
  userId: string | null
  group: PositionGroup | null
  dueAt: string | null
  note: string | null
}

/** Hand a section to one coach or a coach room, with a due date. */
export function DelegateForm(props: {
  sectionName: string
  staff: readonly StaffMember[]
  onDelegate: (input: DelegateInput) => Promise<void>
  onCancel: () => void
}) {
  const rooms = POSITION_GROUPS.filter((group) =>
    props.staff.some((member) => member.groups.includes(group.id)),
  )
  const [who, setWho] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (who === '') {
      setError('Pick a coach or a room')
      return
    }
    const [kind, id] = who.split(':') as ['user' | 'group', string]
    setBusy(true)
    setError(null)
    try {
      await props.onDelegate({
        userId: kind === 'user' ? id : null,
        group: kind === 'group' ? (id as PositionGroup) : null,
        dueAt: due === '' ? null : dueFromDate(due),
        note: note.trim() === '' ? null : note.trim().slice(0, 500),
      })
    } catch (caught) {
      setError(message(caught, 'Could not delegate'))
      setBusy(false)
    }
  }

  return (
    <form
      className="delegate-form"
      aria-label={`Delegate ${props.sectionName}`}
      onSubmit={(event) => void submit(event)}
    >
      <label className="auth-field">
        <span>Delegate to</span>
        <select value={who} onChange={(event) => setWho(event.target.value)}>
          <option value="">Pick a coach or a room</option>
          {rooms.length > 0 ? (
            <optgroup label="Coach rooms">
              {rooms.map((group) => (
                <option key={group.id} value={`group:${group.id}`}>
                  {group.label} room (
                  {props.staff
                    .filter((member) => member.groups.includes(group.id))
                    .map((member) => member.name)
                    .join(', ')}
                  )
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Coaches">
            {props.staff.map((member) => (
              <option key={member.userId} value={`user:${member.userId}`}>
                {member.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="auth-field">
        <span>Due</span>
        <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
      </label>
      <label className="auth-field">
        <span>Note (optional)</span>
        <input
          value={note}
          maxLength={500}
          placeholder="e.g. Chart every run look from film"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="playbook-actions">
        <button type="submit" className="playbook-action primary" disabled={busy}>
          Delegate
        </button>
        <button type="button" className="playbook-action" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** A task on the board, with what the viewer may do to it. */
export interface BoardTask {
  task: ScoutTask
  canSetStatus: boolean
  canRemove: boolean
}

export interface BoardSection {
  folder: Folder
  state: SectionState
  tasks: BoardTask[]
  playCount: number
  canDelegate: boolean
  /** Assigning to players follows the side rules, like the Assign button on a folder. */
  canAssign: boolean
}

/** One row per section: who owns it, status, due date, and the delegate control. */
export function PackBoard(props: {
  title: string
  sections: readonly BoardSection[]
  staff: readonly StaffMember[]
  onOpen: (folderId: string) => void
  onDelegate: (folderId: string, input: DelegateInput) => Promise<void>
  onStatus: (task: ScoutTask, status: ScoutTaskStatus) => Promise<void>
  onRemove: (task: ScoutTask) => Promise<void>
  onAssign: (folderId: string) => void
}) {
  const [delegating, setDelegating] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(message(caught, fallback))
    }
  }

  return (
    <section className="pack-board" aria-labelledby={headingId} data-testid="pack-board">
      <h2 id={headingId}>{props.title}</h2>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="pack-sections">
        {props.sections.map((section) => (
          <li key={section.folder.id} className="pack-section" data-state={section.state}>
            <div className="pack-section-head">
              <button
                type="button"
                className="pack-section-name"
                onClick={() => props.onOpen(section.folder.id)}
              >
                {section.folder.name}
              </button>
              <span className="pack-state" data-state={section.state}>
                {SECTION_LABEL[section.state]}
              </span>
            </div>
            <p className="pack-meta">
              {section.playCount === 1 ? '1 play' : `${section.playCount} plays`}
            </p>
            {section.tasks.length > 0 ? (
              <ul className="pack-tasks" aria-label={`${section.folder.name} owners`}>
                {section.tasks.map(({ task, canSetStatus, canRemove }) => {
                  const due = dueState(task, now)
                  const by = staffName(props.staff, task.statusBy)
                  return (
                    <li key={task.id} className="pack-task">
                      <span className="pack-who">{taskAssigneeLabel(task, props.staff)}</span>
                      <span className="pack-due" data-due={due ?? undefined}>
                        {task.dueAt != null ? `Due ${dueLabel(task.dueAt)}` : 'No due date'}
                        {due === 'overdue' ? ' · Overdue' : ''}
                      </span>
                      {task.note != null ? <span className="pack-note">{task.note}</span> : null}
                      <span className="pack-task-actions">
                        {canSetStatus ? (
                          <select
                            aria-label={`Status for ${taskAssigneeLabel(task, props.staff)}`}
                            value={task.status}
                            onChange={(event) =>
                              void run(
                                () => props.onStatus(task, event.target.value as ScoutTaskStatus),
                                'Could not change the status',
                              )
                            }
                          >
                            {STATUS_ORDER.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="pack-state" data-state={task.status}>
                            {STATUS_LABEL[task.status]}
                          </span>
                        )}
                        {canRemove ? (
                          <button
                            type="button"
                            className="playbook-action"
                            onClick={() => void run(() => props.onRemove(task), 'Could not remove')}
                          >
                            Remove
                          </button>
                        ) : null}
                      </span>
                      {by != null && task.status !== 'todo' ? (
                        <span className="pack-by">
                          {STATUS_LABEL[task.status]} · set by {by}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="pack-meta">Nobody owns this section yet.</p>
            )}
            {delegating === section.folder.id ? (
              <DelegateForm
                sectionName={section.folder.name}
                staff={props.staff}
                onDelegate={async (input) => {
                  await props.onDelegate(section.folder.id, input)
                  setDelegating(null)
                }}
                onCancel={() => setDelegating(null)}
              />
            ) : (
              <div className="playbook-actions pack-section-actions">
                {section.canDelegate ? (
                  <button
                    type="button"
                    className="playbook-action"
                    aria-expanded={false}
                    onClick={() => setDelegating(section.folder.id)}
                  >
                    Delegate
                  </button>
                ) : null}
                {section.canAssign &&
                (section.state === 'ready' || section.state === 'published') ? (
                  <button
                    type="button"
                    className="playbook-action primary"
                    onClick={() => props.onAssign(section.folder.id)}
                  >
                    Assign to players
                  </button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
