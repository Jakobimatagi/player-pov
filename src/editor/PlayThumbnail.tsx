import { memo, useMemo } from 'react'
import type { LookSource, PlaySource } from '../play/sourceTypes'
import { EditorCanvas } from './EditorCanvas'

/**
 * Small, static snapshot of a play for list views: same data as the editor, drawn by the
 * same canvas in `compact` mode. No pointer handlers, so it never steals a tap from its row.
 */
export const PlayThumbnail = memo(function PlayThumbnail({
  source,
  look,
  width = 96,
  height = 128,
  showDefense = false,
}: {
  source: PlaySource
  look: LookSource
  width?: number
  height?: number
  showDefense?: boolean
}) {
  const state = useMemo(() => ({ source, look, selection: null }), [source, look])
  return (
    <EditorCanvas
      state={state}
      width={width}
      height={height}
      compact
      showDefense={showDefense}
      behind={8}
      ahead={16}
    />
  )
})
