import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { CoachLayout } from '../app/CoachLayout'
import { getAuthSnap, subscribeAuth } from '../auth/session'
import { supabase } from '../data/supabase'
import { honorDemoRoster } from '../playbook/archive'
import { COLOR_HEX } from './colors'
import { DiagramScene, type Ghost } from './DiagramScene'
import {
  MIN_LINE_RADII,
  pointInPolygon,
  pointInRect,
  toScreen,
  tokenRadius,
  ZOOMS,
  type ViewState,
} from './geometry'
import {
  BoxSelectIcon,
  CircleIcon,
  CommentIcon,
  LassoIcon,
  LineIcon,
  PointerIcon,
  RedoIcon,
  TrashIcon,
  TriangleIcon,
  UndoIcon,
} from './icons'
import { createState, diagramReducer, drawType, nextId, type Tool } from './model'
import {
  addPlay,
  browserStore,
  goTo,
  positionLabel,
  putDiagram,
  newScript,
  removeAt,
  renameCurrent,
  saveScript,
  savedScript,
  storageKey,
  type DiagramScript,
} from './script'
import {
  FIELD_PRESETS,
  LINE_LABEL,
  LINE_TYPES,
  TOKEN_COLORS,
  type FieldPreset,
  type LineType,
  type Pt,
} from './types'
import { diagramFromFormation } from './formations'
import { FormationPicker } from './FormationPicker'
import { applyPreset, BLANK_LINE, clearSide, PRESETS, type Preset } from './presets'
import { useBook, type BookState } from './useBook'
import { useScenePalette } from './useScenePalette'
import type { SaveStatus } from './saver'
import { useRemoteSave } from './useRemoteSave'
import './diagram.css'
import './editor-ui.css'

type Shape = 'circle' | 'triangle' | 'text'

const SHORTCUTS: [string, string][] = [
  ['V', 'Pointer'],
  ['C', 'Circle'],
  ['T', 'Triangle'],
  ['A', 'Ab text'],
  ['N', 'Comment'],
  ['1–7', 'Draw: arrow, T-cap, line, squiggle, dashed, segmented T, dot'],
  ['Delete', 'Delete selection'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['Esc', 'Deselect, back to pointer'],
]

type Gesture =
  | { kind: 'move'; ids: string[]; start: Pt }
  | { kind: 'line'; playerId: string; type: LineType }
  | { kind: 'area'; a: Pt }
  | { kind: 'lasso'; pts: Pt[] }

function saveLabel(synced: boolean, status: SaveStatus): string {
  if (!synced) return 'Saved on this device only'
  switch (status) {
    case 'saving':
      return 'Saving…'
    case 'error':
      return 'Could not save. Retrying…'
    case 'conflict':
      return 'Changed elsewhere, or you can’t edit this book. Reload to see the saved version.'
    case 'saved':
      return 'Saved'
  }
}

const SHORTCUT_TOOLS: Record<string, Tool> = {
  v: 'select',
  c: 'circle',
  t: 'triangle',
  a: 'text',
  n: 'note',
  ...Object.fromEntries(LINE_TYPES.map((type, i) => [String(i + 1), `draw:${type}` as Tool])),
}

const pixelDistance = (a: Pt, b: Pt, box: { width: number; height: number }) =>
  Math.hypot((a.x - b.x) * box.width, (a.y - b.y) * box.height)

/**
 * The Hudl-style diagrammer: tokens, seven line endings, notes, select tools and a practice
 * script, drawn with Konva. Every edit is written straight to this device's storage.
 */
export function DiagramEditorPage() {
  const [params] = useSearchParams()
  const playbookId = params.get('playbook')
  const roster = params.get('roster')
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  // The base alignment and any saved script must be known before the first play is laid out.
  const lookup = useBook(playbookId, roster)
  const { pathname, search } = useLocation()
  const demo = supabase == null || honorDemoRoster(roster, true, import.meta.env.DEV)
  const rosterQuery = roster === 'demo' ? '&roster=demo' : ''
  const back =
    playbookId != null
      ? {
          to: `/playbook?folder=${playbookId}${rosterQuery}`,
          label: lookup.book?.name ?? 'Playbook',
        }
      : { to: '/playbook', label: 'Playbook' }
  // Signed-out visitors go to log in and come back; players have no draw tool.
  if (!demo && snap.ready && snap.session == null) {
    return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  }
  if (!demo && snap.role === 'player') return <Navigate to="/" replace />
  // Same app shell as every other coach page: sidebar, account menu, theme.
  return (
    <CoachLayout
      title="Draw a play"
      eyebrow="Coach"
      back={back}
      wide
      account={snap.session?.user.email ?? 'Coach Kim'}
    >
      {!lookup.settled ? (
        <p className="loading-line">Loading…</p>
      ) : lookup.error != null ? (
        <p className="auth-error" role="alert">
          {lookup.error}
        </p>
      ) : (
        <DiagramEditor
          key={playbookId ?? 'sandbox'}
          playbookId={playbookId}
          roster={roster}
          lookup={lookup}
        />
      )}
    </CoachLayout>
  )
}

function DiagramEditor({
  playbookId,
  roster,
  lookup,
}: {
  playbookId: string | null
  roster: string | null
  lookup: BookState
}) {
  const { book, remote, synced } = lookup
  const palette = useScenePalette()
  const key = storageKey(playbookId)
  const rosterQuery = roster === 'demo' ? '&roster=demo' : ''
  const base = useMemo(() => diagramFromFormation(book?.formation ?? null), [book])
  // Where the first script comes from: the database, else a draft left on this device
  // (which gets pushed up), else the base alignment.
  const [start] = useState(() => {
    if (remote != null)
      return { script: remote.script, loaded: { version: remote.version, script: remote.script } }
    const local = savedScript(key, browserStore())
    if (local != null) return { script: local, loaded: { version: null, script: null } }
    const fresh = newScript(playbookId == null ? undefined : base)
    return { script: fresh, loaded: { version: null, script: fresh } }
  })
  // `saved` is the script as last arranged; the open play's live diagram is layered on top.
  const [saved, setSaved] = useState<DiagramScript>(start.script)
  const [state, dispatch] = useReducer(diagramReducer, undefined, () =>
    createState(saved.plays[saved.index]?.diagram),
  )
  const script = useMemo(() => putDiagram(saved, state.diagram), [saved, state.diagram])
  const saveStatus = useRemoteSave(playbookId, synced, script, start.loaded)
  const [preset, setPreset] = useState<FieldPreset | null>(null)
  const [zoom, setZoom] = useState(1)
  const [flip, setFlip] = useState(false)
  const [lastShape, setLastShape] = useState<Shape>('circle')
  const [lastDraw, setLastDraw] = useState<LineType>('route')
  const [shortcuts, setShortcuts] = useState(false)
  const [size, setSize] = useState({ width: 640, height: 420 })
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null)
  const [lasso, setLasso] = useState<Pt[] | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const lastPoint = useRef<Pt>({ x: 0, y: 0 })

  // Every edit also lands on this device, so nothing is lost if the network is. A drag changes
  // the script on every pointer move, so the write waits for it to settle, and is flushed
  // when the page is hidden or the editor closes.
  const latest = useRef(script)
  useEffect(() => {
    latest.current = script
    const timer = setTimeout(() => saveScript(key, script, browserStore()), 250)
    return () => clearTimeout(timer)
  }, [key, script])
  useEffect(() => {
    const flush = () => saveScript(key, latest.current, browserStore())
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [key])

  useEffect(() => {
    const el = box.current
    if (el == null) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry == null) return
      // Full width of the card, 1100 x 460 at most, like the reference canvas.
      const width = Math.max(240, Math.min(1100, Math.floor(entry.contentRect.width)))
      setSize({ width, height: Math.round(Math.min(460, Math.max(300, width * 0.418))) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const view: ViewState = { width: size.width, height: size.height, zoom, flip }
  const findPlayer = (id: string) => state.diagram.players.find((p) => p.id === id)
  const pxOf = (id: string): { x: number; y: number } | null => {
    const p = findPlayer(id)
    const n = state.diagram.notes.find((item) => item.id === id)
    const at = p ?? n
    return at == null ? null : toScreen(at, view)
  }

  function startEdit(id: string) {
    const p = findPlayer(id)
    const n = state.diagram.notes.find((item) => item.id === id)
    if (p == null && n == null) return
    setEditing({ id, value: p != null ? (p.label ?? '') : (n?.text ?? '') })
  }

  function commitEdit() {
    const edit = editing
    setEditing(null)
    if (edit != null) dispatch({ type: 'setText', id: edit.id, text: edit.value })
  }

  function placeAt(at: Pt) {
    const tool = state.tool
    if (tool === 'circle' || tool === 'triangle' || tool === 'text') {
      const id = nextId(state.diagram, 'p')
      dispatch({ type: 'addToken', shape: tool, at })
      // A text token is only its text, so it asks for it straight away.
      if (tool === 'text') editSoon(id, 'Ab')
    } else if (tool === 'note') {
      const id = nextId(state.diagram, 'n')
      dispatch({ type: 'addNote', at })
      editSoon(id, 'Note')
    }
  }

  // Open the text box after the click has finished. A press moves focus as its last step, so
  // an input opened during the press is blurred at once and the first keystrokes are lost.
  function editSoon(id: string, value: string) {
    setTimeout(() => setEditing({ id, value }), 0)
  }

  function onItemDown(id: string, at: Pt, event: PointerEvent | MouseEvent) {
    lastPoint.current = at
    const tool = state.tool
    const isLine = state.diagram.lines.some((l) => l.id === id)
    const line = drawType(tool)
    if (line != null) {
      const p = findPlayer(id)
      if (p != null && p.shape !== 'text')
        gesture.current = { kind: 'line', playerId: id, type: line }
      return
    }
    if (tool !== 'select') {
      onStagePoint('down', at, event)
      return
    }
    const additive = event.shiftKey
    const already = state.selection.includes(id)
    const ids = additive
      ? already
        ? state.selection.filter((s) => s !== id)
        : [...state.selection, id]
      : already
        ? state.selection
        : [id]
    if (!already || additive) dispatch({ type: 'select', ids })
    if (isLine || additive) return
    // A press on a token or note is a drag: the first click selects, the move drags.
    gesture.current = { kind: 'move', ids, start: at }
    dispatch({ type: 'moveBegin' })
  }

  function onStagePoint(phase: 'down' | 'move' | 'up', at: Pt, event: PointerEvent | MouseEvent) {
    lastPoint.current = at
    const g = gesture.current
    if (phase === 'down') {
      if (g != null) return
      const tool = state.tool
      if (tool === 'select') {
        if (!event.shiftKey) dispatch({ type: 'select', ids: [] })
      } else if (tool === 'area') {
        gesture.current = { kind: 'area', a: at }
        setMarquee({ a: at, b: at })
      } else if (tool === 'lasso') {
        gesture.current = { kind: 'lasso', pts: [at] }
        setLasso([at])
      } else if (drawType(tool) == null) {
        placeAt(at)
      }
      return
    }
    if (g == null) return
    if (phase === 'move') {
      if (g.kind === 'move') {
        // Total move since the press, so the group can be clamped as one and follow the cursor.
        dispatch({ type: 'moveBy', ids: g.ids, dx: at.x - g.start.x, dy: at.y - g.start.y })
      } else if (g.kind === 'line') {
        const p = findPlayer(g.playerId)
        if (p != null) {
          setGhost({ from: { x: p.x, y: p.y }, to: at, type: g.type, color: p.color })
        }
      } else if (g.kind === 'area') {
        setMarquee({ a: g.a, b: at })
      } else {
        g.pts.push(at)
        setLasso([...g.pts])
      }
      return
    }
    finish(g, at, event.shiftKey)
  }

  function finish(g: Gesture, at: Pt, additive: boolean) {
    gesture.current = null
    setGhost(null)
    setMarquee(null)
    setLasso(null)
    if (g.kind === 'move') {
      dispatch({ type: 'moveEnd' })
    } else if (g.kind === 'line') {
      const p = findPlayer(g.playerId)
      // Measured in pixels: normalized x and y are different lengths, and lineShape draws
      // nothing under this length, so a shorter drag would leave an invisible line.
      if (
        p != null &&
        pixelDistance(p, at, size) > tokenRadius(size.width) * MIN_LINE_RADII * 1.1
      ) {
        dispatch({ type: 'addLine', playerId: g.playerId, lineType: g.type, to: at })
      }
    } else {
      const inside =
        g.kind === 'area'
          ? (pt: Pt) => pointInRect(pt, g.a, at)
          : (pt: Pt) => g.pts.length > 2 && pointInPolygon(pt, g.pts)
      const ids = [
        ...state.diagram.players.filter((p) => inside(p)).map((p) => p.id),
        ...state.diagram.notes.filter((n) => inside(n)).map((n) => n.id),
        ...state.diagram.lines
          .filter((l) => {
            const end = l.points[l.points.length - 1]
            return end != null && inside(end)
          })
          .map((l) => l.id),
      ]
      dispatch({ type: 'select', ids, additive })
    }
  }

  // A release outside the canvas still ends the gesture.
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  })
  useEffect(() => {
    const onUp = () => {
      const g = gesture.current
      if (g != null) finishRef.current(g, lastPoint.current, false)
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (event.key === 'Escape') {
        dispatch({ type: 'select', ids: [] })
        dispatch({ type: 'tool', tool: 'select' })
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        dispatch({ type: 'delete' })
      } else if (!mod && !event.altKey) {
        const pick = SHORTCUT_TOOLS[event.key.toLowerCase()]
        if (pick != null) {
          dispatch({ type: 'tool', tool: pick })
          if (pick === 'circle' || pick === 'triangle' || pick === 'text') setLastShape(pick)
          const kind = drawType(pick)
          if (kind != null) setLastDraw(kind)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function open(next: DiagramScript) {
    const target = next.plays[next.index]
    if (target == null) return
    setSaved(next)
    dispatch({ type: 'load', diagram: target.diagram })
    setEditing(null)
  }

  function chooseTool(tool: Tool) {
    dispatch({ type: 'tool', tool })
    if (tool === 'circle' || tool === 'triangle' || tool === 'text') setLastShape(tool)
    const kind = drawType(tool)
    if (kind != null) setLastDraw(kind)
  }

  // One click sets a formation: from the picker, or by typing its name in the search box.
  // It is one undo step, and the other side and any notes stay.
  const presetNames = useMemo(() => [...PRESETS, BLANK_LINE], [])
  function applyFormation(preset: Preset) {
    dispatch({ type: 'replace', diagram: applyPreset(state.diagram, preset) })
  }
  function pickFormation(text: string) {
    const match = presetNames.find((p) => p.name.toLowerCase() === text.trim().toLowerCase())
    if (match == null) return false
    applyFormation(match)
    return true
  }
  const [search, setSearch] = useState('')
  const [formationsOpen, setFormationsOpen] = useState(false)

  const play = script.plays[script.index]
  const tool = state.tool
  const shapeActive = tool === 'circle' || tool === 'triangle' || tool === 'text'
  const drawKind = drawType(tool)
  const popoverPlayer = state.popover != null ? findPlayer(state.popover) : undefined
  const r = tokenRadius(size.width)
  const back = playbookId != null ? `/playbook?folder=${playbookId}${rosterQuery}` : '/playbook'
  const popAt = popoverPlayer != null ? toScreen(popoverPlayer, view) : null

  return (
    <main className="dge-page">
      <div className="dge">
        <div className="dge-accent" />

        <header className="dge-header">
          <div className="dge-title">
            <span className="dge-num">{script.index + 1}</span>
            <input
              className="dge-name"
              aria-label="Play name"
              style={{ width: `${Math.min(28, Math.max(6, (play?.name.length ?? 0) + 1))}ch` }}
              value={play?.name ?? ''}
              onChange={(event) => setSaved(renameCurrent(script, event.target.value))}
            />
            <span className="dge-count" data-testid="script-position">
              ({positionLabel(script)})
            </span>
            <button
              type="button"
              className="dge-step"
              disabled={script.index === 0}
              onClick={() => open(goTo(script, script.index - 1))}
              aria-label="Previous play"
            >
              ‹
            </button>
            <button
              type="button"
              className="dge-step"
              disabled={script.index >= script.plays.length - 1}
              onClick={() => open(goTo(script, script.index + 1))}
              aria-label="Next play"
            >
              ›
            </button>
          </div>
          <div className="dge-right">
            <span
              className="dge-saved"
              data-testid="autosave"
              data-status={synced ? saveStatus : 'device'}
              role="status"
            >
              {saveLabel(synced, saveStatus)}
            </span>
            {saveStatus === 'conflict' ? (
              <button type="button" className="dge-btn" onClick={() => window.location.reload()}>
                Reload
              </button>
            ) : null}
            <Link className="dge-done" to={back}>
              Done
            </Link>
          </div>
        </header>

        <div className="dge-secondary">
          <input
            className="dge-search"
            aria-label="Add a play, front or formation"
            placeholder="Add a play, front or formation (ex: Gun Trips Right)"
            list="dge-formations"
            value={search}
            onChange={(event) => {
              const value = event.target.value
              if (pickFormation(value)) setSearch('')
              else setSearch(value)
            }}
          />
          <datalist id="dge-formations">
            {presetNames.map((p) => (
              <option key={p.key} value={p.name} />
            ))}
          </datalist>
          <button
            type="button"
            className="dge-dropdown dge-flip"
            aria-expanded={formationsOpen}
            aria-controls="dge-formations-panel"
            onClick={() => setFormationsOpen(!formationsOpen)}
          >
            Formations
          </button>
          <select
            className="dge-dropdown"
            aria-label="Field position"
            value={preset ?? ''}
            onChange={(event) =>
              setPreset(event.target.value === '' ? null : (event.target.value as FieldPreset))
            }
          >
            <option value="">Position</option>
            {(Object.keys(FIELD_PRESETS) as FieldPreset[]).map((id) => (
              <option key={id} value={id}>
                {FIELD_PRESETS[id].label}
              </option>
            ))}
          </select>
          <select
            className="dge-dropdown"
            aria-label="Zoom"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z === 1 ? 'Zoom' : `${Math.round(z * 100)}%`}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dge-dropdown dge-flip"
            aria-pressed={flip}
            onClick={() => setFlip(!flip)}
          >
            Flip Play
          </button>
        </div>

        {formationsOpen ? (
          <div id="dge-formations-panel">
            <FormationPicker
              palette={palette}
              hasOffense={state.diagram.players.some(
                (p) => p.side !== 'defense' && p.shape !== 'text',
              )}
              hasDefense={state.diagram.players.some((p) => p.side === 'defense')}
              onApply={applyFormation}
              onClear={(side) =>
                dispatch({ type: 'replace', diagram: clearSide(state.diagram, side) })
              }
            />
          </div>
        ) : null}

        <div ref={box} className="dge-canvas">
          <div className="dge-scene" style={{ width: size.width, height: size.height }}>
            <DiagramScene
              diagram={state.diagram}
              width={size.width}
              height={size.height}
              preset={preset}
              palette={palette}
              flip={flip}
              zoom={zoom}
              selection={state.selection}
              ghost={ghost}
              marquee={marquee}
              lasso={lasso}
              hidden={editing?.id ?? null}
              onStagePoint={onStagePoint}
              onItemDown={onItemDown}
              onItemDouble={startEdit}
            />
            {popoverPlayer != null && popAt != null && editing == null ? (
              <div
                className="dge-popover"
                role="dialog"
                aria-label="Token colour"
                style={{ left: popAt.x + r * 2.2, top: Math.max(4, popAt.y - r * 2.4) }}
              >
                <div className="dge-swatches">
                  {TOKEN_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`dge-swatch ${color}`}
                      aria-label={color}
                      aria-pressed={popoverPlayer.color === color}
                      style={{ background: COLOR_HEX[color] }}
                      onClick={() => dispatch({ type: 'setStyle', id: popoverPlayer.id, color })}
                    />
                  ))}
                </div>
                {popoverPlayer.shape === 'circle' ? (
                  <div className="dge-fills" role="group" aria-label="Fill">
                    {(['solid', 'split'] as const).map((fillStyle) => (
                      <button
                        key={fillStyle}
                        type="button"
                        aria-pressed={popoverPlayer.fillStyle === fillStyle}
                        onClick={() =>
                          dispatch({ type: 'setStyle', id: popoverPlayer.id, fillStyle })
                        }
                      >
                        {fillStyle === 'solid' ? 'Solid' : 'Half'}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {editing != null
              ? (() => {
                  const at = pxOf(editing.id)
                  if (at == null) return null
                  const isNote = state.diagram.notes.some((n) => n.id === editing.id)
                  return (
                    <input
                      className="dge-edit"
                      aria-label="Text"
                      autoFocus
                      maxLength={isNote ? 80 : 12}
                      style={{ left: at.x + (isNote ? 60 : 0), top: at.y + (isNote ? r : 0) }}
                      value={editing.value}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                      onBlur={commitEdit}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                        else if (event.key === 'Escape') setEditing(null)
                      }}
                    />
                  )
                })()
              : null}
          </div>
        </div>

        <div className="dge-bottom" role="toolbar" aria-label="Tools">
          <button
            type="button"
            className={`dge-tb icon${tool === 'select' ? ' active-pointer' : ''}`}
            aria-pressed={tool === 'select'}
            aria-label="Pointer"
            title="Select (V)"
            onClick={() => chooseTool('select')}
          >
            <PointerIcon />
          </button>

          <span className="dge-divider" />

          <div
            className={`dge-group${shapeActive ? ' highlight' : ''}`}
            role="group"
            aria-label="Add player"
          >
            <button type="button" className="dge-sub label" onClick={() => chooseTool(lastShape)}>
              Add Player
            </button>
            {(
              [
                ['circle', 'Circle', <CircleIcon key="c" />],
                ['triangle', 'Triangle', <TriangleIcon key="t" />],
                ['text', 'Ab text', <span key="a">Ab</span>],
              ] as const
            ).map(([shape, label, icon]) => (
              <button
                key={shape}
                type="button"
                className={`dge-sub${shapeActive && tool === shape ? ' selected' : ''}`}
                aria-pressed={tool === shape}
                aria-label={label}
                title={label}
                onClick={() => chooseTool(shape)}
              >
                {icon}
              </button>
            ))}
          </div>

          <span className="dge-divider" />

          <div
            className={`dge-group${drawKind != null ? ' highlight' : ''}`}
            role="group"
            aria-label="Draw"
          >
            <button
              type="button"
              className="dge-sub label"
              onClick={() => chooseTool(`draw:${lastDraw}`)}
            >
              Draw
            </button>
            {LINE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`dge-sub${drawKind === type ? ' selected' : ''}`}
                aria-pressed={drawKind === type}
                aria-label={LINE_LABEL[type]}
                title={LINE_LABEL[type]}
                onClick={() => chooseTool(`draw:${type}`)}
              >
                <LineIcon type={type} />
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`dge-tb icon${tool === 'note' ? ' active-blue' : ''}`}
            aria-pressed={tool === 'note'}
            aria-label="Comment"
            title="Comment (N)"
            onClick={() => chooseTool('note')}
          >
            <CommentIcon />
          </button>
          <button
            type="button"
            className={`dge-tb icon${tool === 'area' ? ' active-blue' : ''}`}
            aria-pressed={tool === 'area'}
            aria-label="Box select"
            title="Box select"
            onClick={() => chooseTool('area')}
          >
            <BoxSelectIcon />
          </button>
          <button
            type="button"
            className={`dge-tb icon${tool === 'lasso' ? ' active-blue' : ''}`}
            aria-pressed={tool === 'lasso'}
            aria-label="Lasso select"
            title="Lasso select"
            onClick={() => chooseTool('lasso')}
          >
            <LassoIcon />
          </button>

          <span className="dge-spacer" />

          <button
            type="button"
            className="dge-tb"
            disabled={state.selection.length === 0}
            onClick={() => dispatch({ type: 'delete' })}
          >
            <TrashIcon /> Delete
          </button>
          <button
            type="button"
            className="dge-tb"
            disabled={state.past.length === 0}
            onClick={() => dispatch({ type: 'undo' })}
          >
            <UndoIcon /> Undo
          </button>
          <button
            type="button"
            className="dge-tb"
            disabled={state.future.length === 0}
            onClick={() => dispatch({ type: 'redo' })}
          >
            <RedoIcon /> Redo
          </button>

          <button
            type="button"
            className="dge-shortcuts"
            aria-expanded={shortcuts}
            onClick={() => setShortcuts(!shortcuts)}
          >
            Shortcuts
          </button>
          {shortcuts ? (
            <dl className="dge-shortcut-list" aria-label="Keyboard shortcuts">
              {SHORTCUTS.map(([keys, what]) => (
                <div key={keys}>
                  <dt>{keys}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      <section className="dge-script" aria-label="Practice script">
        <div className="dge-script-actions">
          <button type="button" className="dge-btn" onClick={() => open(addPlay(script, base))}>
            Add play
          </button>
          <button
            type="button"
            className="dge-btn"
            disabled={script.plays.length <= 1}
            onClick={() => open(removeAt(script, script.index))}
          >
            Remove play
          </button>
        </div>
        <ol className="dge-thumbs">
          {script.plays.map((item, index) => (
            <li key={item.id} data-current={index === script.index ? 'true' : undefined}>
              <button
                type="button"
                onClick={() => open(goTo(script, index))}
                aria-label={`Open play ${index + 1}: ${item.name}`}
              >
                <DiagramScene
                  diagram={item.diagram}
                  width={96}
                  height={64}
                  interactive={false}
                  palette={palette}
                />
                <span className="dg-num">{index + 1}</span>
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
