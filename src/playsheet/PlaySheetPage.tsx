import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { AccountMenu } from '../app/AccountMenu'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import { canEditSide, SIDE_LABEL } from '../auth/sides'
import { loadPlay, publishPlay, unpublishPlay } from '../data/plays'
import {
  isCompleteRule,
  isEmptyRule,
  listRules,
  missingFields,
  playCompletion,
  REQUIRED_FIELDS,
  saveRule,
  type PositionRule,
  type RuleFields,
} from '../data/rules'
import { loadMySlot } from '../data/slots'
import { supabase } from '../data/supabase'
import { honorDemoRoster } from '../playbook/archive'
import type { PlayFile, Team } from '../play/types'
import { boardLayout, boardOrder, type BoardPlayer } from './board'
import { DEMO_PLAY_NAME, demoPlay, demoRules } from './demo'
import { PlayBoard, type SlotStatus } from './PlayBoard'
import { RuleEditor, RuleView } from './RuleEditor'
import './playsheet.css'

interface SheetPlay {
  id: string
  teamId: string
  name: string
  side: Team
  publishedAt: string | null
  file: PlayFile
}

type Load =
  { status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; play: SheetPlay }

const DEMO_PLAYER_SLOT = 'h'

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

/**
 * The play call: a board of where everyone lines up and goes, and each position's 3 A's
 * (alignment, assignment, adjustment) and 3 R's (read, recognize, react). Coaches edit
 * their side and publish once every position on it is answered. Players read it, opened
 * on their own position.
 */
export function PlaySheetPage() {
  const { playId = '' } = useParams()
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const [params, setParams] = useSearchParams()
  const fixture =
    supabase == null || honorDemoRoster(params.get('roster'), supabase != null, import.meta.env.DEV)
  const playerView = params.get('roster') === 'player' || (!fixture && snap.role === 'player')
  const staff = !playerView && (fixture || snap.role === 'head_coach' || snap.role === 'coach')
  const userId = snap.session?.user.id ?? null

  const [load, setLoad] = useState<Load>(() =>
    fixture
      ? {
          status: 'ready',
          play: {
            id: playId,
            teamId: 'demo',
            name: DEMO_PLAY_NAME,
            side: 'offense',
            publishedAt: null,
            file: demoPlay(),
          },
        }
      : { status: 'loading' },
  )
  const [rules, setRules] = useState<PositionRule[]>(() => (fixture ? demoRules() : []))
  const [rulesVersion, setRulesVersion] = useState(0)
  const [mySlot, setMySlot] = useState<string | null>(() =>
    fixture && playerView ? DEMO_PLAYER_SLOT : null,
  )
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (fixture || snap.session == null) return
    let dead = false
    void (async () => {
      try {
        const [stored, nextRules, slot] = await Promise.all([
          loadPlay(playId),
          listRules(playId),
          playerView && userId != null ? loadMySlot(playId, userId) : Promise.resolve(null),
        ])
        if (dead) return
        setLoad({
          status: 'ready',
          play: {
            id: stored.row.id,
            teamId: stored.row.team_id,
            name: stored.row.name,
            side: stored.row.side,
            publishedAt: stored.row.published_at,
            file: stored.compiled,
          },
        })
        setRules(nextRules)
        setRulesVersion((n) => n + 1)
        setMySlot(slot)
      } catch (error) {
        if (!dead) {
          const text = errorText(error, 'Could not load the play')
          setLoad({
            status: 'error',
            text: text === 'play not found' ? 'This play isn’t available to you.' : text,
          })
        }
      }
    })()
    return () => {
      dead = true
    }
  }, [fixture, playId, playerView, snap.session, userId])

  const ready = load.status === 'ready' ? load.play : null
  const layout = useMemo(
    () => (ready == null ? null : boardLayout(ready.file, ready.side)),
    [ready],
  )
  const ordered = useMemo(() => (layout == null ? [] : boardOrder(layout.players)), [layout])
  const ours = ordered.filter((player) => player.ours)
  const theirs = ordered.filter((player) => !player.ours)
  const completion = playCompletion(
    ours.map((player) => player.id),
    rules,
  )
  const ruleFor = (slot: string) => rules.find((rule) => rule.slot === slot)
  const statusOf = (slot: string): SlotStatus => {
    const player = layout?.players.find((item) => item.id === slot)
    if (player == null || !player.ours) return 'optional'
    return isCompleteRule(ruleFor(slot)) ? 'complete' : 'incomplete'
  }

  const asked = params.get('pos')
  const fallback =
    (mySlot != null && ordered.some((p) => p.id === mySlot) ? mySlot : null) ??
    (staff ? completion.incomplete[0] : null) ??
    ours[0]?.id ??
    null
  const selected = asked != null && ordered.some((p) => p.id === asked) ? asked : fallback
  const picked = ordered.find((player) => player.id === selected) ?? null

  if (!fixture && snap.ready && snap.session == null) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/plays/${playId}`)}`} replace />
  }

  function select(slot: string) {
    const next = new URLSearchParams(params)
    next.set('pos', slot)
    setParams(next, { replace: true })
  }

  const role = fixture ? (playerView ? 'player' : 'head_coach') : snap.role
  const mySide = fixture ? null : snap.side
  const canEditPlayer = (team: Team) =>
    staff && canEditSide(role, mySide, team, snap.specialCoordinator)
  const canPublish =
    ready != null && staff && canEditSide(role, mySide, ready.side, snap.specialCoordinator)
  const published = ready?.publishedAt != null
  const isComplete = completion.incomplete.length === 0 && completion.total > 0

  async function save(player: BoardPlayer, fields: RuleFields) {
    if (ready == null) return
    if (!fixture) {
      await saveRule({
        teamId: ready.teamId,
        playId: ready.id,
        slot: player.id,
        side: player.team,
        rule: fields,
      })
    } else if (published && player.ours && !isCompleteRule(fields)) {
      throw new Error(
        'This play is published, so every answer has to stay filled in. Unpublish it to clear one.',
      )
    }
    setRules((current) => {
      const rest = current.filter((rule) => rule.slot !== player.id)
      if (isEmptyRule(fields)) return rest
      return [
        ...rest,
        { ...fields, slot: player.id, side: player.team, updatedAt: new Date().toISOString() },
      ]
    })
  }

  async function togglePublish() {
    if (ready == null) return
    setPublishing(true)
    setNotice(null)
    try {
      let publishedAt: string | null
      if (published) {
        if (!fixture) await unpublishPlay(ready.id)
        publishedAt = null
      } else {
        if (fixture && !isComplete) {
          throw new Error('Every position needs all 3 A’s and 3 R’s before this play can go out.')
        }
        publishedAt = fixture ? new Date().toISOString() : await publishPlay(ready.id)
      }
      setLoad({ status: 'ready', play: { ...ready, publishedAt } })
      setNotice({
        kind: 'ok',
        text:
          publishedAt == null
            ? 'Back to Draft. Players can’t see this play until you publish it again.'
            : 'Published. Assigned players can now open this play.',
      })
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error, 'Could not change the play') })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="coach-frame play-sheet">
      <div className="coach-main">
        <header className="roster-head sheet-head">
          <div className="sheet-title">
            <Link className="sheet-back" to={playerView ? '/' : '/playbook'}>
              ← {playerView ? 'My plays' : 'Playbook'}
            </Link>
            <h1>{ready?.name ?? 'Play'}</h1>
          </div>
          <AccountMenu name={snap.session?.user.email ?? 'Account'} />
        </header>

        {load.status === 'loading' ? <p className="loading-line">Loading…</p> : null}
        {load.status === 'error' ? <p role="alert">{load.text}</p> : null}

        {ready != null && layout != null ? (
          <>
            <div className="sheet-bar">
              <span className="sheet-side">{SIDE_LABEL[ready.side]}</span>
              {staff ? (
                <span
                  className="sheet-state"
                  data-state={published ? 'published' : 'draft'}
                  data-testid="sheet-state"
                >
                  {published ? 'Published' : 'Draft'}
                </span>
              ) : null}
              {staff ? (
                <span className="sheet-meter" data-testid="sheet-meter">
                  <meter
                    min={0}
                    max={completion.total}
                    value={completion.complete.length}
                    aria-hidden="true"
                  />
                  {completion.complete.length} of {completion.total} positions have all 3 A’s and 3
                  R’s
                </span>
              ) : null}
              <span className="sheet-actions">
                <Link className="btn" to={`/watch/${ready.id}`}>
                  Watch in 3D
                </Link>
                {canPublish ? (
                  <button
                    type="button"
                    className={published ? 'btn' : 'btn primary'}
                    disabled={publishing || (!published && !isComplete)}
                    onClick={() => void togglePublish()}
                    data-testid="sheet-publish"
                  >
                    {published ? 'Unpublish' : 'Publish to players'}
                  </button>
                ) : null}
              </span>
            </div>
            {staff && !published && !isComplete ? (
              <p className="sheet-gate" data-testid="sheet-gate">
                Players can’t see this play yet. Answer all six for{' '}
                {completion.incomplete
                  .map((slot) => ours.find((p) => p.id === slot)?.label ?? slot)
                  .join(', ')}{' '}
                to publish it.
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

            <div className="sheet-body">
              <div className="sheet-board-col">
                <div className="sheet-board-wrap">
                  <PlayBoard
                    layout={layout}
                    name={ready.name}
                    selected={selected}
                    mine={mySlot}
                    status={statusOf}
                    showStatus={staff}
                    onSelect={select}
                  />
                </div>
              </div>

              <aside className="sheet-card" aria-live="polite" data-testid="sheet-card">
                {picked == null ? (
                  <p>Pick a player on the board.</p>
                ) : (
                  <>
                    <header className="sheet-card-head">
                      <h2>
                        {picked.id === mySlot ? 'Your job: ' : ''}
                        {picked.label}
                      </h2>
                      <span className="sheet-card-sub">
                        {SIDE_LABEL[picked.team]}
                        {picked.ours ? '' : ' · scout look'}
                        {staff && picked.ours
                          ? ` · ${REQUIRED_FIELDS.length - missingFields(ruleFor(picked.id)).length} of ${REQUIRED_FIELDS.length} answered`
                          : ''}
                      </span>
                    </header>
                    {staff ? (
                      <RuleEditor
                        key={`${picked.id}:${rulesVersion}`}
                        initial={ruleFor(picked.id)}
                        editable={canEditPlayer(picked.team)}
                        required={picked.ours}
                        side={picked.team}
                        onSave={(fields) => save(picked, fields)}
                      />
                    ) : ruleFor(picked.id) == null && !picked.ours ? (
                      <p className="rule-empty">No notes on this scout-look player.</p>
                    ) : (
                      <RuleView rule={ruleFor(picked.id)} required={picked.ours} />
                    )}
                    {mySlot != null && picked.id !== mySlot ? (
                      <button
                        type="button"
                        className="btn sheet-mine"
                        onClick={() => select(mySlot)}
                      >
                        Back to my position
                      </button>
                    ) : null}
                  </>
                )}
              </aside>

              <div className="sheet-lists">
                <PositionList
                  title={
                    staff
                      ? `${SIDE_LABEL[ready.side]} · every position answers all six`
                      : `${SIDE_LABEL[ready.side]} · tap a teammate to see their job`
                  }
                  players={ours}
                  selected={selected}
                  mine={mySlot}
                  showStatus={staff}
                  status={statusOf}
                  rules={rules}
                  onSelect={select}
                />
                {theirs.length > 0 ? (
                  <PositionList
                    title="Scout look · optional"
                    collapsible
                    players={theirs}
                    selected={selected}
                    mine={mySlot}
                    showStatus={false}
                    status={statusOf}
                    rules={rules}
                    onSelect={select}
                  />
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function PositionList({
  title,
  players,
  selected,
  mine,
  showStatus,
  status,
  rules,
  onSelect,
  collapsible = false,
}: {
  collapsible?: boolean
  title: string
  players: BoardPlayer[]
  selected: string | null
  mine: string | null
  showStatus: boolean
  status: (slot: string) => SlotStatus
  rules: readonly PositionRule[]
  onSelect: (slot: string) => void
}) {
  return (
    <Wrap collapsible={collapsible} title={title}>
      <ul>
        {players.map((player) => {
          const rule = rules.find((item) => item.slot === player.id)
          const left = missingFields(rule).length
          const state = status(player.id)
          return (
            <li key={player.id}>
              <button
                type="button"
                className="sheet-pos"
                aria-pressed={player.id === selected}
                data-status={showStatus ? state : undefined}
                onClick={() => onSelect(player.id)}
              >
                <span className="sheet-pos-name">
                  {player.label}
                  {player.id === mine ? <span className="sheet-you">You</span> : null}
                </span>
                <span className="sheet-pos-sum">
                  {showStatus && player.ours
                    ? left === 0
                      ? '6 of 6'
                      : `${6 - left} of 6`
                    : rule?.assignment || (player.ours ? '' : '—')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Wrap>
  )
}

/** A titled list; the scout look folds away so our positions stay in front. */
function Wrap({
  collapsible,
  title,
  children,
}: {
  collapsible: boolean
  title: string
  children: ReactNode
}) {
  if (collapsible) {
    return (
      <details className="sheet-positions">
        <summary>
          <h3>{title}</h3>
        </summary>
        {children}
      </details>
    )
  }
  return (
    <section className="sheet-positions">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
