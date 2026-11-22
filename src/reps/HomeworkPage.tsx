import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { CoachLayout } from '../app/CoachLayout'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import { dueLabel } from '../data/assignments'
import { loadPlay } from '../data/plays'
import { loadHomework, loadLookSource, submitAttempt, type Homework } from '../data/reps'
import { supabase } from '../data/supabase'
import { compileChart } from '../editor/compileAdapter'
import type { LookSource, PlaySource } from '../play/sourceTypes'
import type { PlayFile } from '../play/types'
import { boardLayout } from '../playsheet/board'
import '../playsheet/playsheet.css'
import { demoAnswer, demoHomework, demoRepPlay, DEMO_REP_LOOKS } from './demo'
import { RepBoard } from './RepBoard'
import {
  describeSpot,
  hideRoute,
  homeworkState,
  isValidSpot,
  scoreAttempt,
  yardsLabel,
  type RepSpot,
} from './target'
import './reps.css'

interface Loaded {
  item: Homework
  source: PlaySource
  compiled: PlayFile | null
  look: LookSource | null
  defaultLookId: string | null
}

type Load =
  { status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; data: Loaded }

interface Result {
  distance: number
  passed: boolean
  spot: RepSpot
}

function demoLoad(assignmentId: string): Load {
  const item = demoHomework().find((row) => row.assignmentId === assignmentId)
  if (item == null) return { status: 'error', text: 'This homework isn’t available to you.' }
  const play = demoRepPlay()
  return {
    status: 'ready',
    data: {
      item,
      source: play.source,
      compiled: null,
      look: DEMO_REP_LOOKS.find((look) => look.id === item.lookId)?.source ?? null,
      defaultLookId: play.defaultLookId,
    },
  }
}

/**
 * One scout rep, from the player's side: the play against the look with their own route
 * hidden. They tap where they end up and submit. The server scores it and the right spot
 * shows up; they can try again as often as they like.
 */
export function HomeworkPage() {
  const { assignmentId = '' } = useParams()
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const fixture = supabase == null
  const signedIn = snap.session != null
  const teamId = snap.teamId
  const [load, setLoad] = useState<Load>(() =>
    fixture ? demoLoad(assignmentId) : { status: 'loading' },
  )
  const [spot, setSpot] = useState<RepSpot | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (fixture || !signedIn || teamId == null) return
    let dead = false
    void (async () => {
      try {
        const list = await loadHomework(teamId)
        const item = list.find((row) => row.assignmentId === assignmentId)
        if (item == null) throw new Error('This homework isn’t available to you.')
        const [stored, look] = await Promise.all([
          loadPlay(item.playId),
          loadLookSource(item.lookId).catch(() => null),
        ])
        if (dead) return
        setLoad({
          status: 'ready',
          data: {
            item,
            source: stored.source,
            compiled: stored.compiled,
            look: look?.source ?? (stored.look?.id === item.lookId ? stored.look.source : null),
            defaultLookId: stored.look?.id ?? null,
          },
        })
      } catch (cause) {
        if (!dead) {
          setLoad({
            status: 'error',
            text: cause instanceof Error ? cause.message : 'Could not load this homework.',
          })
        }
      }
    })()
    return () => {
      dead = true
    }
  }, [fixture, signedIn, teamId, assignmentId])

  const data = load.status === 'ready' ? load.data : null
  const file = useMemo(() => {
    if (data == null) return null
    if (data.look != null) {
      const compiled = compileChart(data.source, data.look).play
      if (compiled != null) return compiled
    }
    return data.item.lookId === data.defaultLookId ? data.compiled : null
  }, [data])
  const fullLayout = useMemo(
    () => (file == null || data == null ? null : boardLayout(file, data.item.playSide)),
    [file, data],
  )

  if (!fixture && snap.ready && snap.session == null) {
    return (
      <Navigate to={`/login?next=${encodeURIComponent(`/homework/${assignmentId}`)}`} replace />
    )
  }

  const item = data?.item ?? null
  const revealed = item != null && item.target != null && item.tolerance != null
  const layout =
    fullLayout == null || item == null
      ? null
      : revealed && result != null
        ? fullLayout
        : hideRoute(fullLayout, item.slot)
  const me = fullLayout?.players.find((p) => p.id === item?.slot)
  const now = new Date()

  async function submit() {
    if (data == null || spot == null || !isValidSpot(spot)) return
    setBusy(true)
    setError(null)
    try {
      if (fixture) {
        const answer = demoAnswer(data.item)
        const score = scoreAttempt(answer.target, answer.tolerance, spot)
        const attempts = data.item.attempts + 1
        setLoad({
          status: 'ready',
          data: {
            ...data,
            item: {
              ...data.item,
              attempts,
              passed: data.item.passed || score.passed,
              target: answer.target,
              tolerance: answer.tolerance,
              note: answer.note === '' ? null : answer.note,
              bestDistance: Math.min(data.item.bestDistance ?? Infinity, score.distance),
              last: { spot, distance: score.distance, passed: score.passed },
            },
          },
        })
        setResult({ ...score, spot })
      } else {
        const scored = await submitAttempt(data.item.assignmentId, spot)
        // Reload for the coaching note, now that the answer is open.
        const fresh = teamId == null ? [] : await loadHomework(teamId).catch(() => [])
        const updated = fresh.find((row) => row.assignmentId === data.item.assignmentId)
        setLoad({
          status: 'ready',
          data: {
            ...data,
            item: updated ?? {
              ...data.item,
              attempts: scored.attempts,
              passed: data.item.passed || scored.passed,
              target: scored.target,
              tolerance: scored.tolerance,
            },
          },
        })
        setResult({ distance: scored.distance, passed: scored.passed, spot })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your answer.')
    } finally {
      setBusy(false)
    }
  }

  function retry() {
    setResult(null)
    setSpot(null)
  }

  const answering = result == null
  const state = item == null ? null : homeworkState(item, now)

  return (
    <CoachLayout
      title={item == null ? 'Homework' : `${item.playName} vs ${item.lookName}`}
      eyebrow="Scout rep"
      back={{ to: '/', label: 'Home' }}
      account={snap.session?.user.email ?? (fixture ? 'Jalen Ortiz' : 'Account')}
      nav={false}
      wide
      className="play-sheet"
    >
      {load.status === 'loading' ? <p className="loading-line">Loading…</p> : null}
      {load.status === 'error' ? <p role="alert">{load.text}</p> : null}
      {data != null && item != null ? (
        <div className="rep-page">
          <div className="rep-board-col">
            {layout != null ? (
              <>
                <RepBoard
                  layout={layout}
                  name={item.playName}
                  slot={item.slot}
                  target={result != null && revealed ? item.target : null}
                  tolerance={result != null && revealed ? item.tolerance : null}
                  answer={result?.spot ?? spot}
                  missed={result != null && !result.passed}
                  onPick={answering ? setSpot : undefined}
                  label={
                    answering
                      ? `Tap where you, ${me?.label ?? item.slot.toUpperCase()}, end up on this play. Arrow keys move your spot.`
                      : 'Your spot and the right spot.'
                  }
                />
                <p className="rep-legend">
                  <span className="lg-you">Your spot</span>
                  {result != null ? (
                    <span className="lg-target">Right spot (counts within the circle)</span>
                  ) : null}
                  <span>Offense moving up</span>
                </p>
              </>
            ) : (
              <p role="alert">This look isn’t available to you yet. Ask your coach.</p>
            )}
          </div>

          <div className="rep-side">
            {result == null ? (
              <section className="rep-card" aria-labelledby="hw-ask" data-testid="hw-ask">
                <h2 id="hw-ask">Where do you end up?</h2>
                <p className="rep-sub">
                  You’re {me?.label ?? item.slot.toUpperCase()}, ringed and marked YOU. Your route
                  is hidden. Tap the board where you finish against {item.lookName}, then submit.
                </p>
                <p className="rep-spot">
                  {state === 'overdue' ? (
                    <span className="rep-pill" data-tone="overdue">
                      Overdue · was due {item.dueAt != null ? dueLabel(item.dueAt) : ''}
                    </span>
                  ) : item.dueAt != null ? (
                    <>Due {dueLabel(item.dueAt)}</>
                  ) : (
                    'No due date'
                  )}
                  {item.attempts > 0
                    ? ` · ${item.attempts} tr${item.attempts === 1 ? 'y' : 'ies'} so far${item.passed ? ', passed' : ''}`
                    : ''}
                </p>
                <p className="rep-spot" data-testid="hw-spot">
                  Your spot:{' '}
                  <strong>
                    {spot == null ? 'tap the board' : describeSpot(spot, item.playSide)}
                  </strong>
                </p>
                {error != null ? (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="rep-row-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || spot == null}
                    onClick={() => void submit()}
                    data-testid="hw-submit"
                  >
                    Submit my spot
                  </button>
                  <Link className="btn" to={`/watch/${item.playId}?look=${item.lookId}`}>
                    Watch in 3D first
                  </Link>
                </div>
              </section>
            ) : (
              <section
                className="rep-result"
                data-passed={result.passed ? 'true' : 'false'}
                aria-live="polite"
                data-testid="hw-result"
              >
                <h2>{result.passed ? 'Got it' : 'Not quite'}</h2>
                <p>
                  You were {yardsLabel(result.distance)} from the right spot
                  {item.tolerance != null ? ` (within ${yardsLabel(item.tolerance)} counts)` : ''}.
                </p>
                {item.target != null ? (
                  <p>
                    Right spot: <strong>{describeSpot(item.target, item.playSide)}</strong>. Your
                    full route is back on the board.
                  </p>
                ) : null}
                {item.note != null && item.note !== '' ? (
                  <p>
                    <strong>Coach:</strong> {item.note}
                  </p>
                ) : null}
                <p className="rep-spot">
                  {item.attempts} tr{item.attempts === 1 ? 'y' : 'ies'}
                  {item.bestDistance != null ? ` · best ${yardsLabel(item.bestDistance)}` : ''}
                </p>
                <div className="rep-row-actions" style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={retry}
                    data-testid="hw-retry"
                  >
                    {result.passed ? 'Rep it again' : 'Try again'}
                  </button>
                  <Link className="btn" to={`/watch/${item.playId}?look=${item.lookId}`}>
                    Watch in 3D
                  </Link>
                  <Link className="btn" to="/">
                    Done
                  </Link>
                </div>
              </section>
            )}
          </div>
        </div>
      ) : null}
    </CoachLayout>
  )
}
