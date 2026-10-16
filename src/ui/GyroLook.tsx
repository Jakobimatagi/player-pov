import { useEffect, useState } from 'react'
import { cameraState, subscribeCamera } from '../camera/cameraState'
import {
  bindGyroStorage,
  disableGyro,
  enableGyroFromGesture,
  gyroApiPresent,
  gyroNeedsGesture,
  gyroStartsWithoutGesture,
  gyroState,
  orientationPermissionRequest,
  readGyroPref,
  restoreGyroPref,
  setGyroWake,
  subscribeGyro,
  type GyroStorage,
} from '../camera/gyro'

function browserStorage(): GyroStorage | null {
  try {
    const store = localStorage
    store.getItem('pov.lookWithPhone')
    return store
  } catch {
    return null
  }
}

/** POV-only phone look. Off until the user turns it on, unless this device already saved On. */
export function GyroLook({
  onFrameloop,
}: {
  onFrameloop: (mode: 'always' | 'demand' | 'never') => void
}) {
  const supported = useState(gyroApiPresent)[0]
  const [mode, setMode] = useState(cameraState.mode)
  const [on, setOn] = useState(() =>
    gyroStartsWithoutGesture(readGyroPref(browserStorage()), gyroNeedsGesture()),
  )
  const [blocked, setBlocked] = useState(gyroState.blocked)

  useEffect(() => subscribeCamera(() => setMode(cameraState.mode)), [])

  useEffect(() => {
    const store = browserStorage()
    bindGyroStorage(store)
    setGyroWake(() => {
      cameraState.movingRef.current = true
      onFrameloop('always')
    })
    const sync = () => {
      setOn(gyroState.enabled)
      setBlocked(gyroState.blocked)
    }
    const unsubscribe = subscribeGyro(sync)
    if (gyroApiPresent()) restoreGyroPref(store, gyroNeedsGesture(), window)
    sync()
    return () => {
      unsubscribe()
      setGyroWake(() => undefined)
    }
  }, [onFrameloop])

  if (!supported || mode !== 'pov') return null

  return (
    <button
      type="button"
      className={on && !blocked ? 'btn primary gyro-look' : 'btn gyro-look'}
      aria-pressed={on && !blocked}
      aria-disabled={blocked}
      disabled={blocked}
      data-testid="gyro-look"
      data-gyro={blocked ? 'blocked' : on ? 'on' : 'off'}
      onClick={() => {
        if (blocked) return
        if (on) {
          disableGyro(performance.now() / 1000)
          setOn(false)
          cameraState.movingRef.current = true
          onFrameloop('always')
          return
        }
        void enableGyroFromGesture(orientationPermissionRequest(), window).then(() => {
          setOn(gyroState.enabled)
          setBlocked(gyroState.blocked)
          if (gyroState.enabled) {
            cameraState.movingRef.current = true
            onFrameloop('always')
          }
        })
      }}
    >
      Look with phone
    </button>
  )
}
