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
import { listTeamLooks, type TeamLook } from '../data/looks'
import { loadMySlot } from '../data/slots'
import { supabase } from '../data/supabase'
import {
  listVariants,
  resolveRule,
  SCOPE_ORDER,
  saveVariant,
  targetLabel,
  targetTag,
  targetsFor,
  variantCount,
  type Facing,
  type RuleVariant,
  type VariantTarget,
} from '../data/variants'
import { compileChart } from '../editor/compileAdapter'
import { detectTags, FORMATION_LIBRARY, tagSummary } from '../formations/library'
import { honorDemoRoster } from '../playbook/archive'
import type { LookSource, PlaySource } from '../play/sourceTypes'
import type { PlayFile, Team } from '../play/types'
import { boardLayout, boardOrder, type BoardPlayer } from './board'
import { DEMO_DEFENSE_ID, DEMO_PLAY_NAME, demoDefense, demoPlay, demoRules } from './demo'
import { PlayBoard, type SlotStatus } from './PlayBoard'
import { RuleEditor, RuleView, VariantEditor } from './RuleEditor'
import './playsheet.css'

interface SheetPlay {
  id: string
  teamId: string
  name: string
  side: Team
  publishedAt: string | null
  file: PlayFile
  /** The editable chart and the look it was saved against, for re-aligning the board. */
  source: PlaySource | null
  look: { id: string; source: LookSource } | null
}

/** A formation the play can be studied against, with the look to compile it with. */
interface FacingOption extends Facing {
  look: LookSource
  /** The look the play was charted against. */
  own: boolean
}

function facingOf(id: string, look: LookSource, own: boolean): FacingOption {
  return { id, name: look.name, tags: detectTags(look), look, own }
}

type Load =
  { status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; play: SheetPlay }

const DEMO_PLAYER_SLOT = 'h'
const DEMO_DEFENSE_SLOT = 'fs'

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
  // The picked player and formation live in state so they change at once; the URL only
  // mirrors them (for links and reloads), because router updates land a render later.
  const [pos, setPos] = useState<string | null>(() => params.get('pos'))
  const [vs, setVs] = useState<string | null>(() => params.get('vs'))

  const [demo] = useState(() => (fixture && playId === DEMO_DEFENSE_ID ? demoDefense() : null))
  const [load, setLoad] = useState<Load>(() =>
    !fixture
      ? { status: 'loading' }
      : demo != null
        ? {
            status: 'ready',
            play: {
              id: playId,
              teamId: 'demo',
              name: demo.name,
              side: 'defense',
              publishedAt: null,
              file: demo.file,
              source: demo.play.source,
              look: { id: demo.play.look.id, source: demo.play.look },
            },
          }
        : {
            status: 'ready',
            play: {
              id: playId,
              teamId: 'demo',
              name: DEMO_PLAY_NAME,
              side: 'offense',
              publishedAt: null,
              file: demoPlay(),
              source: null,
              look: null,
            },
          },
  )
  const [rules, setRules] = useState<PositionRule[]>(() =>
    demo != null ? demo.rules : fixture ? demoRules() : [],
  )
  const [variants, setVariants] = useState<RuleVariant[]>(() => demo?.variants ?? [])
  const [teamLooks, setTeamLooks] = useState<TeamLook[]>([])
  const [rulesVersion, setRulesVersion] = useState(0)
  const [mySlot, setMySlot] = useState<string | null>(() =>
    fixture && playerView ? (demo != null ? DEMO_DEFENSE_SLOT : DEMO_PLAYER_SLOT) : null,
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
        const [stored, nextRules, nextVariants, slot] = await Promise.all([
          loadPlay(playId),
          listRules(playId),
          listVariants(playId),
          playerView && userId != null ? loadMySlot(playId, userId) : Promise.resolve(null),
        ])
        if (dead) return
        // A defense studies the offenses the team has charted; an offense, the defenses.
        const looks =
          stored.row.side === 'defense'
            ? await listTeamLooks(stored.row.team_id, 'offense').catch(() => [])
            : []
        if (dead) return
        setTeamLooks(looks)
        setVariants(nextVariants)
        setLoad({
          status: 'ready',
          play: {
            id: stored.row.id,
            teamId: stored.row.team_id,
            name: stored.row.name,
            side: stored.row.side,
            publishedAt: stored.row.published_at,
            file: stored.compiled,
            source: stored.source,
            look: stored.look == null ? null : { id: stored.look.id, source: stored.look.source },
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

  // Formations a defense play can be studied against: the one it was charted against,
  // the starter library, then the team's own charted formations.
  const facings = useMemo<FacingOption[]>(() => {
    if (ready == null || ready.side !== 'defense' || ready.source == null || ready.look == null) {
      return []
    }
    const ownId = ready.look.source.id ?? ready.look.id
    const out: FacingOption[] = [facingOf(ownId, ready.look.source, true)]
    for (const look of FORMATION_LIBRARY) {
      if (look.id !== ownId) out.push(facingOf(look.id, look, false))
    }
    for (const look of teamLooks) {
      const id = look.source.id ?? look.id
      if (!out.some((item) => item.id === id) && look.id !== ready.look.id) {
        out.push(facingOf(id, { ...look.source, name: look.name }, false))
      }
    }
    return out
  }, [ready, teamLooks])
  const facing = facings.find((item) => item.id === vs) ?? facings[0] ?? null
  const file = useMemo(() => {
    if (ready == null) return null
    if (facing == null || ready.source == null || (facing.own && !fixture)) return ready.file
    return compileChart(ready.source, facing.look).play ?? ready.file
  }, [ready, facing, fixture])
  const layout = useMemo(
    () => (ready == null || file == null ? null : boardLayout(file, ready.side)),
    [ready, file],
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

  const asked = pos
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

  function mirror(nextPos: string | null, nextVs: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (nextPos != null) next.set('pos', nextPos)
        if (nextVs != null) next.set('vs', nextVs)
        return next
      },
      { replace: true },
    )
  }

  function select(slot: string) {
    setPos(slot)
    mirror(slot, vs)
  }

  function face(id: string) {
    // Pin the player on screen so the card doesn't fall back to another position.
    const keep = pos ?? selected
    setPos(keep)
    setVs(id)
    mirror(keep, id)
  }

  const facingIndex = facing == null ? -1 : facings.indexOf(facing)
  const step = (by: number) => {
    if (facings.length === 0) return
    const target = facings[(facingIndex + by + facings.length) % facings.length]
    if (target != null) face(target.id)
  }

  async function saveException(player: BoardPlayer, target: VariantTarget, fields: RuleFields) {
    if (ready == null) return
    const result = fixture
      ? isEmptyRule(fields)
        ? 'deleted'
        : 'saved'
      : await saveVariant({
          teamId: ready.teamId,
          playId: ready.id,
          slot: player.id,
          side: player.team,
          target,
          fields,
        })
    setVariants((current) => {
      const rest = current.filter(
        (item) =>
          !(item.slot === player.id && item.scope === target.scope && item.match === target.match),
      )
      if (result === 'deleted') return rest
      return [...rest, { ...fields, slot: player.id, side: player.team, ...target }]
    })
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

            {facing != null ? (
              <FacingBar
                facings={facings}
                facing={facing}
                onFace={face}
                onStep={step}
                staff={staff}
              />
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
                    <PositionCard
                      key={`${picked.id}:${facing?.id ?? ''}:${rulesVersion}`}
                      player={picked}
                      staff={staff}
                      editable={canEditPlayer(picked.team)}
                      base={ruleFor(picked.id)}
                      variants={variants}
                      facing={facing}
                      onSaveBase={(fields) => save(picked, fields)}
                      onSaveException={(target, fields) => saveException(picked, target, fields)}
                    />
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
                  summary={(slot) =>
                    resolveRule(ruleFor(slot), variants, slot, facing).fields.assignment
                  }
                  exceptions={(slot) => variantCount(variants, slot, facing)}
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
                    summary={(slot) =>
                      resolveRule(ruleFor(slot), variants, slot, facing).fields.assignment
                    }
                    exceptions={(slot) => variantCount(variants, slot, facing)}
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
  summary,
  exceptions,
  onSelect,
  collapsible = false,
}: {
  summary: (slot: string) => string
  exceptions: (slot: string) => number
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
                    : summary(player.id) || (player.ours ? '' : '—')}
                  {exceptions(player.id) > 0 ? (
                    <span className="sheet-pos-vs">
                      {' · '}
                      {exceptions(player.id)} vs this look
                    </span>
                  ) : null}
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

/**
 * What the board is facing. Players flip through formations to study what changes;
 * coaches pick one to write the exceptions for it.
 */
function FacingBar({
  facings,
  facing,
  onFace,
  onStep,
  staff,
}: {
  facings: readonly FacingOption[]
  facing: FacingOption
  onFace: (id: string) => void
  onStep: (by: number) => void
  staff: boolean
}) {
  return (
    <section className="facing" aria-label="Facing formation" data-testid="facing">
      <div className="facing-head">
        <span className="facing-label">Facing</span>
        <strong className="facing-name">{facing.name}</strong>
        <span className="facing-tags">{tagSummary(facing.tags)}</span>
        <span className="facing-step">
          <button
            type="button"
            className="btn"
            aria-label="Previous formation"
            onClick={() => onStep(-1)}
          >
            ‹
          </button>
          <span>
            {facings.indexOf(facing) + 1} / {facings.length}
          </span>
          <button
            type="button"
            className="btn"
            aria-label="Next formation"
            onClick={() => onStep(1)}
          >
            ›
          </button>
        </span>
      </div>
      <label className="facing-pick">
        <span className="visually-hidden">Pick a formation</span>
        <select value={facing.id} onChange={(event) => onFace(event.currentTarget.value)}>
          {facings.map((item) => (
            <option key={item.id} value={item.id}>
              {item.own ? `${item.name} (as charted)` : item.name} · {item.tags.structure} ·{' '}
              {item.tags.personnel}
            </option>
          ))}
        </select>
      </label>
      <p className="facing-hint">
        {staff
          ? 'Defenders re-align to this formation. Write what changes against it in each position’s “vs” tabs.'
          : 'Flip through the formations to see how your job changes against each one.'}
      </p>
    </section>
  )
}

type Layer = 'base' | VariantTarget['scope']

/**
 * One position's card. Everyone sees the answers against the formation being faced, with
 * a tag on each answer an exception changed. Coaches switch between the base rule and
 * the three exception layers that apply to this formation.
 */
function PositionCard({
  player,
  staff,
  editable,
  base,
  variants,
  facing,
  onSaveBase,
  onSaveException,
}: {
  player: BoardPlayer
  staff: boolean
  editable: boolean
  base: PositionRule | undefined
  variants: readonly RuleVariant[]
  facing: Facing | null
  onSaveBase: (fields: RuleFields) => Promise<void>
  onSaveException: (target: VariantTarget, fields: RuleFields) => Promise<void>
}) {
  const [layer, setLayer] = useState<Layer>('base')
  const resolved = resolveRule(base, variants, player.id, facing)
  const tags: Partial<Record<keyof RuleFields, string>> = {}
  for (const [key, target] of Object.entries(resolved.from)) {
    if (target != null) tags[key as keyof RuleFields] = targetTag(target)
  }
  const targets = facing == null ? [] : targetsFor(facing)
  const has = (target: VariantTarget) =>
    variants.some(
      (item) =>
        item.slot === player.id && item.scope === target.scope && item.match === target.match,
    )

  if (!staff) {
    if (base == null && !player.ours && Object.keys(tags).length === 0) {
      return <p className="rule-empty">No notes on this scout-look player.</p>
    }
    return <RuleView rule={resolved.fields} required={player.ours} tags={tags} />
  }

  const target = targets.find((item) => item.scope === layer) ?? null
  // What this layer sits on: the base plus every less specific exception.
  const below = (t: VariantTarget) => {
    const rank = SCOPE_ORDER.indexOf(t.scope)
    return resolveRule(
      base,
      variants.filter((item) => SCOPE_ORDER.indexOf(item.scope) > rank),
      player.id,
      facing,
    ).fields
  }

  return (
    <>
      {facing != null ? (
        <div className="layer-tabs" role="tablist" aria-label="Which rule to edit">
          <button
            type="button"
            role="tab"
            aria-selected={layer === 'base'}
            className="layer-tab"
            onClick={() => setLayer('base')}
          >
            Every formation
          </button>
          {targets.map((item) => (
            <button
              key={item.scope}
              type="button"
              role="tab"
              aria-selected={layer === item.scope}
              className="layer-tab"
              data-has={has(item) ? 'true' : undefined}
              onClick={() => setLayer(item.scope)}
            >
              {targetLabel(item, facing)}
            </button>
          ))}
        </div>
      ) : null}
      {layer === 'base' || target == null ? (
        <>
          {facing != null && Object.keys(tags).length > 0 ? (
            <p className="layer-note">
              Against {facing.name}, {Object.keys(tags).length} answer
              {Object.keys(tags).length === 1 ? '' : 's'} change. Open a “vs” tab to see or edit
              them.
            </p>
          ) : null}
          <RuleEditor
            initial={base}
            editable={editable}
            required={player.ours}
            side={player.team}
            onSave={onSaveBase}
          />
        </>
      ) : (
        <VariantEditor
          key={`${target.scope}:${target.match}`}
          initial={variants.find(
            (item) =>
              item.slot === player.id && item.scope === target.scope && item.match === target.match,
          )}
          inherited={below(target)}
          editable={editable}
          label={targetLabel(target, facing ?? undefined)}
          side={player.team}
          onSave={(fields) => onSaveException(target, fields)}
        />
      )}
    </>
  )
}
