import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { advanceClock, clockState } from './clockState'

/** The only clock subscriber. Priority -1 so poses and the camera read the new t. */
export function useClock(): null {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    clockState.invalidateRef.current = invalidate
    return () => {
      clockState.invalidateRef.current = () => undefined
    }
  }, [invalidate])

  useFrame((_, delta) => {
    advanceClock(delta)
  }, -1)
  return null
}
