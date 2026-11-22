import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import tripsFlood from '../../fixtures/trips-flood.source.json'
import tripsFloodFast from '../../fixtures/trips-flood-fast.source.json'
import { Button } from '../components/ui/button'
import { COVER_2_LOOK } from '../play/cover2Look'
import type { PlaySource, RouteKind } from '../play/sourceTypes'
import type { Position } from '../play/types'
import { editorReducer } from './actions'
import { EditorCanvas, type CanvasPointer } from './EditorCanvas'
import { PlayThumbnail } from './PlayThumbnail'
import { FIELD_PRESETS, ROUTE_KIND_LABEL, ROUTE_KINDS } from './routeKinds'
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
  findPlayer,
  isLegRef,
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
  const [size, setSize] = useState({ width: 480, height: 640 })

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
        // Draw: each tap extends the selected player's line by one leg of the chosen kind.
        dispatch({
          type: 'addLeg',
          ref: { side: sel.side, slot: sel.slot },
          to: rel,
          kind: state.routeKind,
        })
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
      const ref = drag.current
      if (ref == null) return
      if (isLegRef(ref)) dispatch({ type: 'moveLeg', ref, to: rel })
      else dispatch({ type: 'moveAlign', ref, dx: rel.dx, dy: rel.dy })
    } else if (drag.current != null) {
      drag.current = null
      dispatch({ type: 'endDrag' })
    }
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

      <div ref={box} className="editor-stage">
        <EditorCanvas state={view} width={size.width} height={size.height} onPointer={onPointer} />
      </div>

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
    </main>
  )
}
