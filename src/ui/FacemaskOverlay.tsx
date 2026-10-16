import { useEffect, useState } from 'react'
import { cameraState, subscribeCamera } from '../camera/cameraState'
import type { CompiledPlay } from '../play/types'

/** Screen-fixed helmet bars. They are not parented to the camera, so free-look cannot move them. */
export function FacemaskOverlay({ play }: { play: CompiledPlay }) {
  const [mode, setMode] = useState(cameraState.mode)
  const [attached, setAttached] = useState(cameraState.attached)

  useEffect(
    () =>
      subscribeCamera(() => {
        setMode(cameraState.mode)
        setAttached(cameraState.attached)
      }),
    [],
  )

  const team = attached >= 0 && play.teams[attached] === 'defense' ? 'defense' : 'offense'
  const active = mode === 'pov'

  return (
    <svg
      className={active ? 'facemask is-on' : 'facemask'}
      data-testid="facemask"
      data-team={team}
      data-active={active ? 'true' : 'false'}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect className="mask-bar" x="7" y="22" width="8" height="48" rx="1.5" />
      <rect className="mask-bar" x="85" y="22" width="8" height="48" rx="1.5" />
      <rect className="helmet-band" x="0" y="91" width="100" height="9" />
    </svg>
  )
}
