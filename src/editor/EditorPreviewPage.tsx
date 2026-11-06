import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import NorthIcon from '@mui/icons-material/North'
import RedoIcon from '@mui/icons-material/Redo'
import TouchAppIcon from '@mui/icons-material/TouchApp'
import UndoIcon from '@mui/icons-material/Undo'
import tripsFlood from '../../fixtures/trips-flood.source.json'
import { CoachLayout } from '../app/CoachLayout'
import { getAuthSnap, subscribeAuth } from '../auth/session'
import { COVER_2_LOOK } from '../play/cover2Look'
import type { PlaySource } from '../play/sourceTypes'
import { editorReducer } from './actions'
import { EditorCanvas } from './EditorCanvas'
import type { Hit } from './hitTest'
import { createEditorState, findPlayer, isLegRef, type EditorState } from './state'

function selectionText(s: EditorState): string {
  const sel = s.selection
  if (sel == null) return 'Nothing selected'
  const player = findPlayer(s, sel)
  if (player == null) return 'Nothing selected'
  const who = `${player.position}${player.jersey != null ? ` #${player.jersey}` : ''} (${sel.slot})`
  if (isLegRef(sel) && sel.leg >= 0) return `Selected: ${who}, leg ${sel.leg + 1}`
  return `Selected: ${who}`
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box
        component="kbd"
        sx={{
          px: 1,
          py: 0.25,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {keys}
      </Box>
    </Stack>
  )
}

/** Dev-only harness for the C5 editor core: render, select, undo. C7 replaces it with /plays/:id/edit. */
export function EditorPreviewPage() {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState({ source: tripsFlood as PlaySource, look: COVER_2_LOOK }),
  )
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 480, height: 640 })

  useEffect(() => {
    const el = box.current
    if (el == null) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry == null) return
      const width = Math.floor(entry.contentRect.width)
      // Vertical field: taller than wide, but never taller than the window.
      const height = Math.max(360, Math.min(window.innerHeight - 200, Math.round(width * 1.3)))
      setSize({ width, height })
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

  const selected = sel != null

  return (
    <CoachLayout
      title={state.name}
      subtitle={`${state.source.formation ?? 'Formation'} vs ${state.look.name}`}
      account={snap.session?.user.email ?? 'Coach'}
      actions={
        <Stack direction="row" spacing={1} role="toolbar" aria-label="Editor">
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<UndoIcon />}
            onClick={() => dispatch({ type: 'undo' })}
            disabled={state.past.length === 0}
          >
            Undo
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<RedoIcon />}
            onClick={() => dispatch({ type: 'redo' })}
            disabled={state.future.length === 0}
          >
            Redo
          </Button>
        </Stack>
      }
    >
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} sx={{ alignItems: 'flex-start' }}>
        <Box
          ref={box}
          sx={{
            width: '100%',
            maxWidth: 600,
            borderRadius: 3,
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
            boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          }}
        >
          <EditorCanvas state={state} width={size.width} height={size.height} onHit={onHit} />
        </Box>

        <Card sx={{ width: '100%', maxWidth: { xs: 600, lg: 340 }, flexShrink: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="overline" color="text.secondary">
              Selection
            </Typography>
            <Box sx={{ mt: 1, mb: 2 }}>
              <Chip
                data-testid="editor-selection"
                icon={selected ? undefined : <TouchAppIcon />}
                label={selectionText(state)}
                color={selected ? 'secondary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                sx={{ maxWidth: '100%' }}
              />
            </Box>
            <Button
              fullWidth
              variant="contained"
              startIcon={<NorthIcon />}
              onClick={nudge}
              disabled={sel == null}
            >
              Nudge 1 yd
            </Button>
            <Divider sx={{ my: 3 }} />
            <Typography variant="overline" color="text.secondary">
              How it works
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Tap a player or a bend in a route to select it. Dragging and drawing routes come next.
            </Typography>
            <Stack spacing={1.25}>
              <Shortcut keys="⌘Z" label="Undo" />
              <Shortcut keys="⇧⌘Z" label="Redo" />
              <Shortcut keys="Esc" label="Clear selection" />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </CoachLayout>
  )
}
