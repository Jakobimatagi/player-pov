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
  suspendGyro,
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

function coarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** POV-only phone look. Off until the user turns it on, unless this device already saved On. */
export function GyroLook({
  onFrameloop,
}: {
  onFrameloop: (mode: 'always' | 'demand' | 'never') => void
}) {
  const [coarse, setCoarse] = useState(coarsePointer)
  const supported = gyroApiPresent() && coarse
  const [mode, setMode] = useState(cameraState.mode)
  const [on, setOn] = useState(() =>
    gyroStartsWithoutGesture(readGyroPref(browserStorage()), gyroNeedsGesture()),
  )
  const [blocked, setBlocked] = useState(gyroState.blocked)

  useEffect(() => subscribeCamera(() => setMode(cameraState.mode)), [])

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)')
    const onChange = () => setCoarse(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

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
    if (mode === 'pov' && supported) restoreGyroPref(store, gyroNeedsGesture(), window)
    else suspendGyro()
    sync()
    return () => {
      unsubscribe()
      setGyroWake(() => undefined)
      suspendGyro()
    }
  }, [onFrameloop, mode, supported])

  if (!supported || mode !== 'pov') return null

  return (
    <button
      type="button"
      className={on && !blocked ? 'btn primary gyro-look' : 'btn gyro-look'}
      aria-pressed={on && !blocked}
      data-testid="gyro-look"
      data-gyro={blocked ? 'blocked' : on ? 'on' : 'off'}
      onClick={() => {
        if (on && !blocked) {
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
