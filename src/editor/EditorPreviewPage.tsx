import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import tripsFlood from '../../fixtures/trips-flood.source.json'
import tripsFloodFast from '../../fixtures/trips-flood-fast.source.json'
import { Button } from '../components/ui/button'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import { createPlay, listFolders } from '../data/plays'
import { supabase } from '../data/supabase'
import { DEMO_FOLDERS, honorDemoRoster } from '../playbook/archive'
import { addDrawnDemo } from '../playbook/drawnDemo'
import { effectiveFormation, type Folder } from '../playbook/folders'
import { drawnPlayError, formationPlay } from '../playbook/newPlays'
import { COVER_2_LOOK } from '../play/cover2Look'
import type { PlaySource, RouteEnd, RouteKind } from '../play/sourceTypes'
import type { Position } from '../play/types'
import { editorReducer } from './actions'
import { EditorCanvas, type CanvasPointer } from './EditorCanvas'
import { CLICK_YARDS, MIN_STEP, pathLength, simplifyStroke, type Pt } from './freehand'
import { PlayThumbnail } from './PlayThumbnail'
import {
  defaultEnd,
  FIELD_PRESETS,
  markOf,
  ROUTE_END_LABEL,
  ROUTE_ENDS,
  ROUTE_KIND_LABEL,
  ROUTE_KINDS,
} from './routeKinds'
import {
  blankPlay,
  copyPlay,
  goTo,
  insertAfter,
  move,
  positionLabel,
  putCurrent,
  removeAt,
  type Script,
} from './script'
import {
  chartLayout,
  createEditorState,
  sameRef,
  findPlayer,
  isLegRef,
  MAX_LEGS,
  type EditorState,
  type LegRef,
  type PlayerRef,
  type Tool,
} from './state'
import './editor.css'

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: 'select', label: 'Select' },
  { tool: 'player', label: 'Add player' },
  { tool: 'route', label: 'Draw' },
]
const ADD_POSITIONS: Position[] = ['WR', 'TE', 'RB', 'FB', 'QB']

const START: Script = {
  plays: [tripsFlood as PlaySource, tripsFloodFast as PlaySource],
  index: 0,
}

function selectionText(s: EditorState): string {
  const sel = s.selection
  if (sel == null) return 'Nothing selected'
  const player = findPlayer(s, sel)
  if (player == null) return 'Nothing selected'
  const who = `${player.position}${player.jersey != null ? ` #${player.jersey}` : ''} (${sel.slot})`
  if (isLegRef(sel) && sel.leg >= 0) return `Selected: ${who}, leg ${sel.leg + 1}`
  return `Selected: ${who}`
}

/**
 * Dev harness for the editor: draw, drag, undo, step through a practice script.
 * C7 replaces it with /plays/:id/edit and saves to the database; the script lives in memory here.
 */
export function EditorPreviewPage() {
  const [script, setScript] = useState<Script>(START)
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState({ source: START.plays[0] as PlaySource, look: COVER_2_LOOK }),
  )
  const [preset, setPreset] = useState('play')
  const [addPosition, setAddPosition] = useState<Position>('WR')
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<PlayerRef | LegRef | null>(null)
  // A freehand stroke in progress: the points laid down so far, in absolute field yards.
  const stroke = useRef<{ ref: PlayerRef; pts: Pt[] } | null>(null)
  const [ghost, setGhost] = useState<Pt[] | null>(null)
  // Double-click on a circle edits its text. Single click only selects and drags.
  const [editing, setEditing] = useState<{
    ref: PlayerRef
    px: number
    py: number
    value: string
  } | null>(null)
  const [size, setSize] = useState({ width: 480, height: 640 })

  // /draw?playbook=<id>: one new play, lined up in that playbook's base alignment, filed into it.
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const playbookId = params.get('playbook')
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  // No backend, or the dev demo roster the playbook page was opened with.
  const demo = supabase == null || honorDemoRoster(params.get('roster'), true, import.meta.env.DEV)
  const rosterQuery = supabase != null && demo ? '&roster=demo' : ''
  const [book, setBook] = useState<{ folder: Folder; formation: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (playbookId == null) return
    if (!demo && auth.teamId == null) return
    let dead = false
    void (async () => {
      try {
        const folders = demo ? DEMO_FOLDERS : (await listFolders(auth.teamId ?? '')).folders
        const folder = folders.find((item) => item.id === playbookId)
        if (dead) return
        if (folder == null) {
          setProblem('That playbook was not found')
          return
        }
        const formation = effectiveFormation(folders, folder.id)
        setBook({ folder, formation })
        const play = formationPlay(formation, 'New play')
        dispatch({
          type: 'load',
          source: play.source,
          look: play.look,
          playId: null,
          baseVersion: null,
          lookId: null,
          lookBaseVersion: null,
        })
      } catch (error) {
        if (!dead)
          setProblem(error instanceof Error ? error.message : 'Could not load the playbook')
      }
    })()
    return () => {
      dead = true
    }
  }, [playbookId, demo, auth.teamId])

  async function saveToPlaybook() {
    if (book == null) return
    const play = { source: { ...state.source, name: state.name.trim() }, look: state.look }
    if (play.source.name.length === 0) {
      setProblem('Give the play a name')
      return
    }
    const bad = drawnPlayError(play)
    if (bad != null) {
      setProblem(bad)
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      if (demo) addDrawnDemo(book.folder.id, play)
      else {
        if (auth.teamId == null) throw new Error('No team')
        await createPlay({ teamId: auth.teamId, folderId: book.folder.id, play })
      }
      navigate(`/playbook?folder=${book.folder.id}${rosterQuery}`)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save the play')
      setSaving(false)
    }
  }

  // The chart the canvas draws. A field-position preset re-anchors the ball for the view
  // only: every point is ball-relative, so the play itself is never touched.
  const view = useMemo(() => {
    const yardLine = FIELD_PRESETS.find((p) => p.id === preset)?.yardLine ?? -1
    if (yardLine < 0) return state
    return {
      ...state,
      source: { ...state.source, ballSpot: { ...state.source.ballSpot, yardLine } },
    }
  }, [state, preset])

  useEffect(() => {
    const el = box.current
    if (el == null) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry == null) return
      const width = Math.floor(entry.contentRect.width)
      // Vertical field: taller than wide, but never taller than the window.
      const height = Math.max(360, Math.min(window.innerHeight - 140, Math.round(width * 1.3)))
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const deleteSelection = () => {
    const sel = state.selection
    if (sel == null) return
    const player = findPlayer(state, sel)
    if (player == null) return
    if (isLegRef(sel) && sel.leg >= 0) {
      dispatch({ type: 'removeLeg', ref: sel })
    } else if (player.legs.length > 0) {
      dispatch({ type: 'clearRoute', ref: { side: sel.side, slot: sel.slot } })
    } else {
      dispatch({ type: 'removePlayer', ref: { side: sel.side, slot: sel.slot } })
    }
  }

  const deleteRef = useRef(deleteSelection)
  useEffect(() => {
    deleteRef.current = deleteSelection
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (event.key === 'Escape') {
        dispatch({ type: 'select', target: null })
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onPointer = (event: CanvasPointer) => {
    const layout = chartLayout(view)
    const rel = { dx: event.field.x - layout.los, dy: event.field.y - layout.ballY }
    const { hit } = event
    if (event.phase === 'down') {
      const sel = state.selection
      if (state.tool === 'player' && hit.kind !== 'player' && hit.kind !== 'waypoint') {
        dispatch({ type: 'addPlayer', position: addPosition, at: rel })
        return
      }
      if (
        state.tool === 'route' &&
        sel != null &&
        (hit.kind === 'field' || hit.kind === 'segment')
      ) {
        // Draw: a tap adds a corner point, a drag draws freehand. Which one it was is
        // known on release; until then the stroke is only previewed.
        stroke.current = { ref: { side: sel.side, slot: sel.slot }, pts: [event.field] }
        return
      }
      if (hit.kind === 'field') {
        dispatch({ type: 'select', target: null })
      } else if (hit.kind === 'segment') {
        dispatch({ type: 'select', target: hit.ref })
      } else {
        dispatch({ type: 'select', target: hit.ref })
        // A drag moves the dot or waypoint under the pointer; it is one undo step.
        if (state.tool !== 'player') {
          drag.current = hit.ref
          dispatch({ type: 'beginDrag' })
        }
      }
    } else if (event.phase === 'move') {
      const free = stroke.current
      if (free != null) {
        const last = free.pts[free.pts.length - 1]
        if (last != null && Math.hypot(event.field.x - last.x, event.field.y - last.y) < MIN_STEP) {
          return
        }
        free.pts.push(event.field)
        const player = layout.players.find((p) => sameRef(p.ref, free.ref))
        const end = player?.points[player.points.length - 1]
        setGhost(end != null ? [end, ...free.pts] : [...free.pts])
        return
      }
      const ref = drag.current
      if (ref == null) return
      if (isLegRef(ref)) dispatch({ type: 'moveLeg', ref, to: rel })
      else dispatch({ type: 'moveAlign', ref, dx: rel.dx, dy: rel.dy })
    } else if (stroke.current != null) {
      const free = stroke.current
      stroke.current = null
      setGhost(null)
      finishStroke(free.ref, free.pts, layout)
    } else if (drag.current != null) {
      drag.current = null
      dispatch({ type: 'endDrag' })
    }
  }

  const toRel = (p: Pt, layout: { los: number; ballY: number }) => ({
    dx: p.x - layout.los,
    dy: p.y - layout.ballY,
  })

  function finishStroke(ref: PlayerRef, pts: Pt[], layout: ReturnType<typeof chartLayout>) {
    const draw = {
      kind: state.routeKind,
      ...(state.routeEnd != null ? { end: state.routeEnd } : {}),
    }
    const first = pts[0]
    if (first == null) return
    if (pathLength(pts) < CLICK_YARDS) {
      dispatch({ type: 'addLeg', ref, to: toRel(first, layout), ...draw })
      return
    }
    const owner = findPlayer(state, ref)
    const room = MAX_LEGS - (owner?.legs.length ?? 0)
    // Drop the first point: the line already starts at the player or its last waypoint.
    const corners = simplifyStroke(pts, room).slice(1)
    if (corners.length === 0) return
    // One undo step for the whole stroke.
    dispatch({ type: 'beginDrag' })
    for (const corner of corners) {
      dispatch({ type: 'addLeg', ref, to: toRel(corner, layout), ...draw })
    }
    dispatch({ type: 'endDrag' })
  }

  /** Give the selected route (its last leg) a flat or arrow end, or none. */
  function pickEnd(end: RouteEnd) {
    dispatch({ type: 'setDrawEnd', end })
    if (sel == null) return
    const owner = findPlayer(state, sel)
    if (owner == null || owner.legs.length === 0) return
    dispatch({
      type: 'setLeg',
      ref: { side: sel.side, slot: sel.slot, leg: owner.legs.length - 1 },
      patch: { end },
    })
  }

  const selectedOwner = state.selection != null ? findPlayer(state, state.selection) : undefined
  const lastLeg = selectedOwner?.legs[selectedOwner.legs.length - 1]
  const shownEnd: RouteEnd =
    lastLeg != null
      ? (lastLeg.end ?? defaultEnd(lastLeg.kind ?? 'route'))
      : (state.routeEnd ?? defaultEnd(state.routeKind))

  function commitMark() {
    const edit = editing
    setEditing(null)
    if (edit == null) return
    dispatch({ type: 'setPlayer', ref: edit.ref, patch: { mark: edit.value } })
  }

  const sel = state.selection
  const selected = sel != null ? findPlayer(state, sel) : undefined

  // Script navigation: park the play being edited in the script, then load the other one.
  const open = (next: Script) => {
    const target = next.plays[next.index]
    if (target == null) return
    setScript(next)
    dispatch({
      type: 'load',
      source: target,
      look: state.look,
      playId: null,
      baseVersion: null,
      lookId: null,
      lookBaseVersion: null,
    })
  }
  const parked = () => putCurrent(script, state.source)
  const step = (delta: -1 | 1) => open(goTo(parked(), script.index + delta))
  const jump = (index: number) => open(goTo(parked(), index))

  const chip = (active: boolean) => (active ? 'default' : 'outline')

  return (
    <main className="editor-preview">
      {playbookId != null ? (
        <div className="editor-script-nav" role="group" aria-label="New play">
          <Link className="editor-back" to={`/playbook?folder=${playbookId}${rosterQuery}`}>
            ‹ {book?.folder.name ?? 'Playbook'}
          </Link>
          <input
            className="editor-name"
            aria-label="Play name"
            value={state.name}
            onChange={(event) => dispatch({ type: 'rename', name: event.target.value })}
          />
          <Button onClick={() => void saveToPlaybook()} disabled={book == null || saving}>
            {saving ? 'Saving…' : 'Save to playbook'}
          </Button>
        </div>
      ) : null}
      {problem != null ? (
        <p className="auth-error" role="alert">
          {problem}
        </p>
      ) : null}
      {playbookId != null ? null : (
        <div className="editor-script-nav" role="group" aria-label="Script">
          <Button
            variant="outline"
            size="sm"
            onClick={() => step(-1)}
            disabled={script.index === 0}
            aria-label="Previous play"
          >
            ‹ Prev
          </Button>
          <strong data-testid="script-position">{positionLabel(script)}</strong>
          <Button
            variant="outline"
            size="sm"
            onClick={() => step(1)}
            disabled={script.index >= script.plays.length - 1}
            aria-label="Next play"
          >
            Next ›
          </Button>
          <input
            className="editor-name"
            aria-label="Play name"
            value={state.name}
            onChange={(event) => dispatch({ type: 'rename', name: event.target.value })}
          />
        </div>
      )}

      <div className="editor-toolbar" role="toolbar" aria-label="Editor">
        {TOOLS.map(({ tool, label }) => (
          <Button
            key={tool}
            variant={chip(state.tool === tool)}
            aria-pressed={state.tool === tool}
            onClick={() => dispatch({ type: 'setTool', tool })}
          >
            {label}
          </Button>
        ))}
        {state.tool === 'route' ? (
          <span className="editor-group" role="group" aria-label="Line type">
            {ROUTE_KINDS.map((kind: RouteKind) => (
              <Button
                key={kind}
                size="sm"
                variant={chip(state.routeKind === kind)}
                aria-pressed={state.routeKind === kind}
                onClick={() => {
                  dispatch({ type: 'setDrawKind', kind })
                  dispatch({ type: 'setDrawEnd', end: null })
                  if (sel != null && !isLegRef(sel)) {
                    dispatch({ type: 'setRouteKind', ref: sel, kind })
                  }
                }}
              >
                {ROUTE_KIND_LABEL[kind]}
              </Button>
            ))}
          </span>
        ) : null}
        {state.tool === 'route' ? (
          <span className="editor-group" role="group" aria-label="Line end">
            {ROUTE_ENDS.map((end) => (
              <Button
                key={end}
                size="sm"
                variant={chip(shownEnd === end)}
                aria-pressed={shownEnd === end}
                onClick={() => pickEnd(end)}
              >
                {ROUTE_END_LABEL[end]}
              </Button>
            ))}
          </span>
        ) : null}
        {state.tool === 'player' ? (
          <select
            className="editor-select"
            aria-label="Position to add"
            value={addPosition}
            onChange={(event) => setAddPosition(event.target.value as Position)}
          >
            {ADD_POSITIONS.map((position) => (
              <option key={position}>{position}</option>
            ))}
          </select>
        ) : null}
        <Button
          variant="outline"
          onClick={() => dispatch({ type: 'undo' })}
          disabled={state.past.length === 0}
        >
          Undo
        </Button>
        <Button
          variant="outline"
          onClick={() => dispatch({ type: 'redo' })}
          disabled={state.future.length === 0}
        >
          Redo
        </Button>
        <Button variant="outline" onClick={deleteSelection} disabled={selected == null}>
          Delete
        </Button>
        <select
          className="editor-select"
          aria-label="Field position"
          value={preset}
          onChange={(event) => setPreset(event.target.value)}
        >
          {FIELD_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="editor-status" data-testid="editor-selection">
          {selectionText(state)}
        </span>
      </div>

      <div ref={box} className="editor-stage" hidden={playbookId != null && book == null}>
        <EditorCanvas
          state={view}
          width={size.width}
          height={size.height}
          onPointer={onPointer}
          ghost={ghost}
          onEditPlayer={(ref, at) => {
            const owner = findPlayer(state, ref)
            const text = chartLayout(view).players.find((p) => sameRef(p.ref, ref))
            setEditing({
              ref,
              px: at.px,
              py: at.py,
              value:
                owner?.mark ?? (text != null ? markOf(text.ref.slot, text.position, ref.side) : ''),
            })
          }}
        />
        {editing != null ? (
          <input
            className="editor-mark-input"
            aria-label="Circle text"
            autoFocus
            maxLength={4}
            style={{ left: editing.px, top: editing.py }}
            value={editing.value}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            onBlur={commitMark}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              else if (event.key === 'Escape') setEditing(null)
            }}
          />
        ) : null}
      </div>

      {playbookId != null ? null : (
        <section className="editor-script" aria-label="Practice script">
          <div className="editor-script-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const base = parked()
                open(insertAfter(base, blankPlay(state.source, `Play ${base.plays.length + 1}`)))
              }}
            >
              Add play
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => open(insertAfter(parked(), copyPlay(state.source)))}
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={script.plays.length <= 1}
              onClick={() => open(removeAt(parked(), script.index))}
            >
              Remove play
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={script.index === 0}
              onClick={() => open(move(parked(), script.index, -1))}
            >
              Move up
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={script.index >= script.plays.length - 1}
              onClick={() => open(move(parked(), script.index, 1))}
            >
              Move down
            </Button>
          </div>
          <ol className="editor-script-list">
            {parked().plays.map((play, index) => (
              <li key={index} data-current={index === script.index ? 'true' : undefined}>
                <button
                  type="button"
                  onClick={() => jump(index)}
                  aria-label={`Open play ${index + 1}: ${play.name}`}
                >
                  <PlayThumbnail source={play} look={state.look} />
                  <span className="editor-script-num">{index + 1}</span>
                  <span className="editor-script-name">{play.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  )
}
