import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { CoachLayout } from '../app/CoachLayout'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import { canEditSide } from '../auth/sides'
import { dueLabel } from '../data/assignments'
import { listTeamLooks } from '../data/looks'
import { loadPlay } from '../data/plays'
import {
  assignRep,
  createRep,
  deleteRep,
  listRepAssignments,
  listReps,
  loadRepResults,
  unassignRep,
  updateRep,
  type RepAssignment,
  type RepResult,
  type ScoutRep,
} from '../data/reps'
import { listTeamPlayers, type TeamPlayer } from '../data/slots'
import { supabase } from '../data/supabase'
import { compileChart } from '../editor/compileAdapter'
import { AssignPanel } from '../playbook/AssignPanel'
import type { LookSource, PlaySource } from '../play/sourceTypes'
import type { PlayFile } from '../play/types'
import { boardLayout, boardOrder } from '../playsheet/board'
import '../playsheet/playsheet.css'
import {
  DEMO_REP_ASSIGNMENTS,
  DEMO_REP_LOOKS,
  DEMO_REP_PLAYERS,
  DEMO_REP_RESULTS,
  demoRepPlay,
  demoReps,
} from './demo'
import { RepBoard } from './RepBoard'
import {
  clampTolerance,
  DEFAULT_TOLERANCE,
  defaultTarget,
  describeSpot,
  MAX_TOLERANCE,
  MIN_TOLERANCE,
  yardsLabel,
  type RepSpot,
} from './target'
import './reps.css'

interface RepPlay {
  id: string
  teamId: string
  name: string
  side: 'offense' | 'defense'
  publishedAt: string | null
  source: PlaySource
  compiled: PlayFile | null
  defaultLookId: string | null
}

interface LookOption {
  id: string
  name: string
  source: LookSource
}

interface Data {
  play: RepPlay
  looks: LookOption[]
  reps: ScoutRep[]
  assignments: RepAssignment[]
  results: RepResult[]
  players: TeamPlayer[]
}

type Load =
  { status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; data: Data }

interface Draft {
  lookId: string
  slot: string
  target: RepSpot | null
  tolerance: number
  note: string
  /** The coach moved the target, so changing the look or slot keeps it. */
  moved: boolean
}

function demoData(): Data {
  const play = demoRepPlay()
  return {
    play: { ...play, compiled: null },
    looks: DEMO_REP_LOOKS,
    reps: demoReps(),
    assignments: DEMO_REP_ASSIGNMENTS,
    results: DEMO_REP_RESULTS,
    players: DEMO_REP_PLAYERS,
  }
}

let demoSerial = 0
/** Ids for rows made in demo mode. */
function demoId(prefix: string): string {
  demoSerial += 1
  return `${prefix}-demo-${demoSerial}`
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

/**
 * Scout reps on one play: the coach picks a look and a position, drags where that player
 * should end up, sets how close counts, then assigns it as homework and watches results.
 */
export function RepsPage() {
  const { playId = '' } = useParams()
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const [params, setParams] = useSearchParams()
  const fixture = supabase == null
  const signedIn = snap.session != null
  const userId = snap.session?.user.id ?? null

  const [load, setLoad] = useState<Load>(() =>
    fixture ? { status: 'ready', data: demoData() } : { status: 'loading' },
  )
  const [selected, setSelected] = useState<string | null>(
    () => params.get('rep') ?? (params.get('new') != null ? 'new' : null),
  )
  const [edited, setEdited] = useState<{ key: string; changes: Partial<Draft> }>({
    key: '',
    changes: {},
  })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (fixture || !signedIn) return
    let dead = false
    void (async () => {
      try {
        const stored = await loadPlay(playId)
        const teamId = stored.row.team_id
        const side = stored.row.side === 'defense' ? 'defense' : 'offense'
        const [teamLooks, reps, results, players] = await Promise.all([
          listTeamLooks(teamId, side === 'offense' ? 'defense' : 'offense'),
          listReps(playId),
          loadRepResults(teamId),
          listTeamPlayers(teamId),
        ])
        const assignments = await listRepAssignments(reps.map((rep) => rep.id))
        const looks: LookOption[] = teamLooks.map((look) => ({
          id: look.id,
          name: look.name,
          source: look.source,
        }))
        if (stored.look != null && !looks.some((look) => look.id === stored.look?.id)) {
          looks.unshift({
            id: stored.look.id,
            name: stored.look.source.name,
            source: stored.look.source,
          })
        }
        if (dead) return
        setLoad({
          status: 'ready',
          data: {
            play: {
              id: stored.row.id,
              teamId,
              name: stored.row.name,
              side,
              publishedAt: stored.row.published_at,
              source: stored.source,
              compiled: stored.compiled,
              defaultLookId: stored.look?.id ?? null,
            },
            looks,
            reps,
            assignments,
            results: results.filter((row) => reps.some((rep) => rep.id === row.repId)),
            players,
          },
        })
      } catch (error) {
        if (!dead) setLoad({ status: 'error', text: errorText(error, 'Could not load the reps') })
      }
    })()
    return () => {
      dead = true
    }
  }, [fixture, signedIn, playId])

  const data = load.status === 'ready' ? load.data : null
  const rep =
    data == null || selected == null || selected === 'new'
      ? null
      : (data.reps.find((item) => item.id === selected) ?? null)

  // The draft is the picked rep (or a blank new rep) with the coach's edits on top. Edits
  // belong to one selection, so picking another rep starts clean.
  const editing = selected === 'new' || rep != null
  const edits = edited.key === (selected ?? '') ? edited.changes : {}
  const base: Draft | null =
    rep != null
      ? {
          lookId: rep.lookId,
          slot: rep.slot,
          target: rep.target,
          tolerance: rep.tolerance,
          note: rep.note,
          moved: true,
        }
      : selected === 'new' && data != null
        ? {
            lookId: data.play.defaultLookId ?? data.looks[0]?.id ?? '',
            slot: '',
            target: null,
            tolerance: DEFAULT_TOLERANCE,
            note: '',
            moved: false,
          }
        : null
  const merged = base == null ? null : { ...base, ...edits }

  const lookId = merged?.lookId ?? null
  const look = data?.looks.find((item) => item.id === lookId) ?? null
  const file = useMemo(() => {
    if (data == null || look == null) return null
    const compiled = compileChart(data.play.source, look.source).play
    if (compiled != null) return compiled
    return look.id === data.play.defaultLookId ? data.play.compiled : null
  }, [data, look])
  const layout = useMemo(
    () => (file == null || data == null ? null : boardLayout(file, data.play.side)),
    [file, data],
  )
  const ours = useMemo(
    () => (layout == null ? [] : boardOrder(layout.players).filter((player) => player.ours)),
    [layout],
  )

  // A new rep picks the first of our positions, and its target follows the route end until
  // the coach moves it.
  let draft: Draft | null = null
  if (merged != null && editing) {
    const slotNow =
      rep != null || ours.some((p) => p.id === merged.slot) ? merged.slot : (ours[0]?.id ?? '')
    const target = merged.moved || file == null ? merged.target : defaultTarget(file, slotNow)
    draft = { ...merged, slot: slotNow, target }
  }
  const slot = draft?.slot ?? null

  if (!fixture && snap.ready && snap.session == null) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/plays/${playId}/reps`)}`} replace />
  }

  const role = fixture ? 'head_coach' : snap.role
  const canEdit =
    data != null &&
    canEditSide(role, fixture ? null : snap.side, data.play.side, snap.specialCoordinator)
  const lookName = (id: string) => data?.looks.find((item) => item.id === id)?.name ?? 'a look'
  const slotLabel = (id: string) => ours.find((p) => p.id === id)?.label ?? id.toUpperCase()

  function choose(next: string | null) {
    setSelected(next)
    setNotice(null)
    setEdited({ key: next ?? '', changes: {} })
    setParams(
      () => {
        const out = new URLSearchParams()
        if (next === 'new') out.set('new', '1')
        else if (next != null) out.set('rep', next)
        return out
      },
      { replace: true },
    )
  }

  function update(change: Partial<Draft>) {
    const key = selected ?? ''
    setEdited((current) => ({
      key,
      changes: { ...(current.key === key ? current.changes : {}), ...change },
    }))
  }

  function resetTarget() {
    if (file == null || draft == null) return
    update({ target: defaultTarget(file, draft.slot), moved: false })
  }

  async function save() {
    if (data == null || draft == null || draft.target == null) return
    setBusy(true)
    setNotice(null)
    try {
      if (selected === 'new') {
        const created = fixture
          ? {
              id: demoId('rep'),
              teamId: data.play.teamId,
              playId: data.play.id,
              lookId: draft.lookId,
              slot: draft.slot,
              target: draft.target,
              tolerance: draft.tolerance,
              note: draft.note,
              createdAt: new Date().toISOString(),
            }
          : await createRep({
              teamId: data.play.teamId,
              playId: data.play.id,
              lookId: draft.lookId,
              slot: draft.slot,
              target: draft.target,
              tolerance: draft.tolerance,
              note: draft.note,
              createdBy: userId ?? '',
            })
        setLoad({ status: 'ready', data: { ...data, reps: [...data.reps, created] } })
        choose(created.id)
        setNotice({ kind: 'ok', text: 'Rep saved. Assign it below.' })
      } else if (rep != null) {
        const change = { target: draft.target, tolerance: draft.tolerance, note: draft.note }
        if (!fixture) await updateRep(rep.id, change)
        setLoad({
          status: 'ready',
          data: {
            ...data,
            reps: data.reps.map((item) => (item.id === rep.id ? { ...item, ...change } : item)),
          },
        })
        setEdited({ key: rep.id, changes: {} })
        setNotice({ kind: 'ok', text: 'Saved. New attempts are scored against this spot.' })
      }
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error, 'Could not save the rep') })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (data == null || rep == null) return
    if (!window.confirm('Delete this rep? Its assignments and every attempt go with it.')) return
    try {
      if (!fixture) await deleteRep(rep.id)
      setLoad({
        status: 'ready',
        data: {
          ...data,
          reps: data.reps.filter((item) => item.id !== rep.id),
          assignments: data.assignments.filter((item) => item.repId !== rep.id),
          results: data.results.filter((item) => item.repId !== rep.id),
        },
      })
      choose(null)
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error, 'Could not delete the rep') })
    }
  }

  const dirty =
    rep != null &&
    draft != null &&
    (draft.target?.x !== rep.target.x ||
      draft.target?.y !== rep.target.y ||
      draft.tolerance !== rep.tolerance ||
      draft.note !== rep.note)

  return (
    <CoachLayout
      title={data == null ? 'Scout reps' : `Scout reps · ${data.play.name}`}
      eyebrow="Homework"
      back={{ to: `/plays/${playId}`, label: 'Play sheet' }}
      account={snap.session?.user.email ?? (fixture ? 'Coach Diaz' : 'Account')}
      wide
      className="play-sheet"
    >
      {load.status === 'loading' ? <p className="loading-line">Loading…</p> : null}
      {load.status === 'error' ? <p role="alert">{load.text}</p> : null}
      {data != null ? (
        <>
          {data.play.publishedAt == null ? (
            <p className="sheet-gate" data-testid="reps-draft">
              This play is a draft. You can build reps now; publish it before you assign them.
            </p>
          ) : null}
          {notice != null ? (
            <p
              className={notice.kind === 'error' ? 'sheet-notice error' : 'sheet-notice'}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </p>
          ) : null}
          <div className="rep-page">
            <div className="rep-board-col">
              {layout != null && slot != null && slot !== '' ? (
                <>
                  <RepBoard
                    layout={layout}
                    name={data.play.name}
                    slot={slot}
                    target={draft?.target ?? null}
                    tolerance={draft?.tolerance ?? null}
                    onPick={
                      canEdit && draft != null
                        ? (spot) => update({ target: spot, moved: true })
                        : undefined
                    }
                    label={
                      canEdit
                        ? `Target spot for ${slotLabel(slot)}. Tap or drag to move it; arrow keys nudge it half a yard.`
                        : `Target spot for ${slotLabel(slot)}.`
                    }
                  />
                  <p className="rep-legend">
                    <span className="lg-target">Target and tolerance</span>
                    <span>Offense moving up · against {look?.name ?? 'the look'}</span>
                  </p>
                </>
              ) : (
                <div className="rep-card">
                  <h2>Reps check where a player ends up</h2>
                  <ol className="rep-steps">
                    <li>Pick a scout look and a position.</li>
                    <li>
                      Drag the target to where that player should finish. It starts at the end of
                      their route.
                    </li>
                    <li>Set how close counts, then assign it with a due date.</li>
                    <li>Players tap their spot on the board. You see who got it and how close.</li>
                  </ol>
                </div>
              )}
            </div>

            <div className="rep-side">
              <section className="rep-card" aria-labelledby="rep-list-head" data-testid="rep-list">
                <h2 id="rep-list-head">Reps on this play</h2>
                <p className="rep-sub">
                  {data.reps.length === 0
                    ? 'None yet.'
                    : `${data.reps.length} rep${data.reps.length === 1 ? '' : 's'}`}
                </p>
                <ul className="rep-list">
                  {data.reps.map((item) => {
                    const rows = data.results.filter((row) => row.repId === item.id)
                    const passed = rows.filter((row) => row.passed).length
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="rep-list-item"
                          aria-current={item.id === selected ? 'true' : undefined}
                          onClick={() => choose(item.id)}
                        >
                          <span className="rep-list-main">
                            <span className="rep-list-title">
                              {item.slot.toUpperCase()} vs {lookName(item.lookId)}
                            </span>
                            <span className="rep-list-meta">
                              Within {yardsLabel(item.tolerance)} ·{' '}
                              {rows.length === 0
                                ? 'Not assigned'
                                : `${passed} of ${rows.length} passed`}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {canEdit ? (
                  <div className="rep-row-actions" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => choose('new')}
                      aria-pressed={selected === 'new'}
                    >
                      New rep
                    </button>
                  </div>
                ) : null}
              </section>

              {draft != null && (selected === 'new' || rep != null) ? (
                <section
                  className="rep-card"
                  aria-labelledby="rep-edit-head"
                  data-testid="rep-editor"
                >
                  <h2 id="rep-edit-head">
                    {selected === 'new'
                      ? 'New rep'
                      : `${draft.slot.toUpperCase()} vs ${lookName(draft.lookId)}`}
                  </h2>
                  <p className="rep-sub">
                    {selected === 'new'
                      ? 'The target starts where the route ends against this look. Drag it if the player should finish somewhere else.'
                      : 'The look and position are fixed. Make a new rep to change them.'}
                  </p>
                  <div className="rep-fields">
                    <label className="auth-field">
                      <span>Scout look</span>
                      <select
                        value={draft.lookId}
                        disabled={selected !== 'new' || !canEdit}
                        onChange={(event) => update({ lookId: event.currentTarget.value })}
                      >
                        {data.looks.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.id === data.play.defaultLookId ? ' (as charted)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="auth-field">
                      <span>Position</span>
                      <select
                        value={draft.slot}
                        disabled={selected !== 'new' || !canEdit}
                        onChange={(event) =>
                          update({ slot: event.currentTarget.value, moved: false })
                        }
                      >
                        {ours.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <span className="rep-spot">
                        Target:{' '}
                        <strong>
                          {draft.target == null ? '—' : describeSpot(draft.target, data.play.side)}
                        </strong>
                      </span>
                    </div>
                    <label className="auth-field">
                      <span>Counts as right within</span>
                      <span className="rep-tol">
                        <input
                          type="range"
                          min={MIN_TOLERANCE}
                          max={MAX_TOLERANCE}
                          step={0.5}
                          value={draft.tolerance}
                          disabled={!canEdit}
                          onChange={(event) =>
                            update({ tolerance: clampTolerance(Number(event.currentTarget.value)) })
                          }
                          aria-label="Tolerance in yards"
                        />
                        <output>{yardsLabel(draft.tolerance)}</output>
                      </span>
                    </label>
                    <label className="auth-field">
                      <span>Coaching point (shown after their first try)</span>
                      <textarea
                        value={draft.note}
                        maxLength={280}
                        disabled={!canEdit}
                        onChange={(event) => update({ note: event.currentTarget.value })}
                        placeholder="Why this spot, what to look for"
                      />
                    </label>
                    {canEdit ? (
                      <div className="rep-row-actions">
                        <button
                          type="button"
                          className="btn primary"
                          disabled={busy || draft.target == null || (rep != null && !dirty)}
                          onClick={() => void save()}
                          data-testid="rep-save"
                        >
                          {selected === 'new' ? 'Save rep' : 'Save changes'}
                        </button>
                        <button type="button" className="btn" onClick={resetTarget}>
                          Back to route end
                        </button>
                        {rep != null ? (
                          <button type="button" className="btn" onClick={() => void remove()}>
                            Delete
                          </button>
                        ) : (
                          <button type="button" className="btn" onClick={() => choose(null)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="folder-hint">
                        Only the head coach or this play’s coordinator can change its reps.
                      </p>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          {rep != null ? (
            <div className="rep-page">
              <div id="rep-assign">
                <AssignPanel
                  folderName={`${rep.slot.toUpperCase()} vs ${lookName(rep.lookId)}`}
                  side={data.play.side}
                  own={data.assignments.filter((item) => item.repId === rep.id)}
                  inherited={[]}
                  players={data.players}
                  playCount={1}
                  draftCount={data.play.publishedAt == null ? 1 : 0}
                  canEdit={canEdit}
                  hint={
                    <p className="folder-hint">
                      Homework for a position group or one player. They open {data.play.name}{' '}
                      against {lookName(rep.lookId)} and tap where {rep.slot.toUpperCase()} ends up.
                      {rep.lookId === data.play.defaultLookId
                        ? ''
                        : ' This look isn’t the play’s own, so they need a scout package with it first.'}
                    </p>
                  }
                  lockedHint={
                    <p className="folder-hint">
                      Only the head coach or this play’s coordinator can assign it.
                    </p>
                  }
                  onAssign={async (input) => {
                    const made = fixture
                      ? { id: demoId('asg'), repId: rep.id, ...input }
                      : await assignRep({
                          teamId: data.play.teamId,
                          repId: rep.id,
                          createdBy: userId ?? '',
                          ...input,
                        })
                    const fresh = fixture ? data.results : await loadRepResults(data.play.teamId)
                    setLoad({
                      status: 'ready',
                      data: {
                        ...data,
                        assignments: [...data.assignments, made],
                        results: fresh.filter((row) =>
                          data.reps.some((item) => item.id === row.repId),
                        ),
                      },
                    })
                  }}
                  onRemove={async (assignment) => {
                    if (!fixture) await unassignRep(assignment.id)
                    setLoad({
                      status: 'ready',
                      data: {
                        ...data,
                        assignments: data.assignments.filter((item) => item.id !== assignment.id),
                        results: data.results.filter((row) => row.assignmentId !== assignment.id),
                      },
                    })
                  }}
                  onClose={() => choose(null)}
                />
              </div>
              <RepResults
                rows={data.results.filter((row) => row.repId === rep.id)}
                players={data.players}
                tolerance={rep.tolerance}
              />
            </div>
          ) : null}

          <p className="rep-legend">
            <Link
              className="rep-link"
              to={`/watch/${data.play.id}${lookId != null ? `?look=${lookId}` : ''}`}
            >
              Watch in 3D{look != null ? ` against ${look.name}` : ''}
            </Link>
          </p>
        </>
      ) : null}
    </CoachLayout>
  )
}

function statusOf(row: RepResult, now: Date): { tone: string; text: string } {
  if (row.passed) return { tone: 'pass', text: 'Passed' }
  if (row.dueAt != null && Date.parse(row.dueAt) < now.getTime()) {
    return { tone: 'overdue', text: row.attempts === 0 ? 'Overdue' : 'Overdue · missed' }
  }
  if (row.attempts === 0) return { tone: 'todo', text: 'Not started' }
  return { tone: 'fail', text: 'Missed' }
}

/** Who did the rep and how close they got: first try, best try, attempts, passed. */
export function RepResults({
  rows,
  players,
  tolerance,
  now = new Date(),
}: {
  rows: readonly RepResult[]
  players: readonly TeamPlayer[]
  tolerance: number
  now?: Date
}) {
  const name = (id: string) => players.find((p) => p.userId === id)?.name ?? 'A player'
  const sorted = [...rows].sort((a, b) => name(a.userId).localeCompare(name(b.userId)))
  const tried = rows.filter((row) => row.attempts > 0).length
  const passed = rows.filter((row) => row.passed).length
  const firstTry = rows.filter((row) => row.firstPassed === true).length
  return (
    <section className="rep-card" aria-labelledby="rep-results-head" data-testid="rep-results">
      <h2 id="rep-results-head">Results</h2>
      <p className="rep-sub">
        Right means within {yardsLabel(tolerance)} of the target. Retries are unlimited; the first
        try is kept.
      </p>
      {rows.length === 0 ? (
        <p className="rep-sub">Assign it to see results here.</p>
      ) : (
        <>
          <dl className="rep-summary">
            <div>
              <dt>Tried</dt>
              <dd>
                {tried} / {rows.length}
              </dd>
            </div>
            <div>
              <dt>Passed</dt>
              <dd>{rows.length === 0 ? '0%' : `${Math.round((passed / rows.length) * 100)}%`}</dd>
            </div>
            <div>
              <dt>First try</dt>
              <dd>{firstTry}</dd>
            </div>
          </dl>
          <table className="rep-results">
            <thead>
              <tr>
                <th>Player</th>
                <th>Status</th>
                <th>First try</th>
                <th>Best</th>
                <th>Tries</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const state = statusOf(row, now)
                return (
                  <tr key={`${row.assignmentId}:${row.userId}`}>
                    <td className="who">{name(row.userId)}</td>
                    <td data-label="Status">
                      <span className="rep-pill" data-tone={state.tone}>
                        {state.text}
                      </span>
                    </td>
                    <td data-label="First try" className="num">
                      {row.firstDistance == null
                        ? '—'
                        : `${row.firstPassed ? '✓' : '✗'} ${yardsLabel(row.firstDistance)}`}
                    </td>
                    <td data-label="Best" className="num">
                      {row.bestDistance == null ? '—' : yardsLabel(row.bestDistance)}
                    </td>
                    <td data-label="Tries" className="num">
                      {row.attempts}
                    </td>
                    <td data-label="Due">{row.dueAt == null ? '—' : dueLabel(row.dueAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
