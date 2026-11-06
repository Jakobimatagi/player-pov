import { useEffect, useReducer, useRef, useState } from 'react'
import tripsFlood from '../../fixtures/trips-flood.source.json'
import { COVER_2_LOOK } from '../play/cover2Look'
import type { PlaySource } from '../play/sourceTypes'
import { editorReducer } from './actions'
import { EditorCanvas } from './EditorCanvas'
import type { Hit } from './hitTest'
import { createEditorState, findPlayer, isLegRef, type EditorState } from './state'
import './editor.css'

function selectionText(s: EditorState): string {
  const sel = s.selection
  if (sel == null) return 'Nothing selected'
  const player = findPlayer(s, sel)
  if (player == null) return 'Nothing selected'
  const who = `${player.position}${player.jersey != null ? ` #${player.jersey}` : ''} (${sel.slot})`
  if (isLegRef(sel) && sel.leg >= 0) return `Selected: ${who}, leg ${sel.leg + 1}`
  return `Selected: ${who}`
}

/** Dev-only harness for the C5 editor core: render, select, undo. C7 replaces it with /plays/:id/edit. */
export function EditorPreviewPage() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState({ source: tripsFlood as PlaySource, look: COVER_2_LOOK }),
  )
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 450 })

  useEffect(() => {
    const el = box.current
    if (el == null) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry == null) return
      const width = Math.floor(entry.contentRect.width)
      setSize({ width, height: Math.max(240, Math.round(width * 0.56)) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (event.key === 'Escape') {
        dispatch({ type: 'select', target: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onHit = (hit: Hit) => {
    if (hit.kind === 'field') dispatch({ type: 'select', target: null })
    else dispatch({ type: 'select', target: hit.ref })
  }

  const sel = state.selection
  const nudge = () => {
    if (sel == null) return
    const player = findPlayer(state, sel)
    if (player == null) return
    if (isLegRef(sel) && sel.leg >= 0) {
      // Ball-relative end of the selected leg, then one yard further downfield.
      let dx = 0
      let dy = 0
      for (const leg of player.legs.slice(0, sel.leg + 1)) {
        dx += leg.to.dx
        dy += leg.to.dy
      }
      const origin = 'anchor' in player.align ? null : player.align
      if (origin == null) return
      dispatch({ type: 'moveLeg', ref: sel, to: { dx: origin.dx + dx + 1, dy: origin.dy + dy } })
      return
    }
    if ('anchor' in player.align) return
    dispatch({
      type: 'moveAlign',
      ref: sel,
      dx: player.align.dx + 1,
      dy: player.align.dy,
    })
  }

  return (
    <main className="editor-preview">
      <div className="editor-toolbar" role="toolbar" aria-label="Editor">
        <button
          type="button"
          onClick={() => dispatch({ type: 'undo' })}
          disabled={state.past.length === 0}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'redo' })}
          disabled={state.future.length === 0}
        >
          Redo
        </button>
        <button type="button" onClick={nudge} disabled={sel == null}>
          Nudge 1 yd
        </button>
        <span className="editor-status" data-testid="editor-selection">
          {selectionText(state)}
        </span>
      </div>
      <h1 className="editor-title">{state.name}</h1>
      <div ref={box} className="editor-stage">
        <EditorCanvas state={state} width={size.width} height={size.height} onHit={onHit} />
      </div>
    </main>
  )
}
