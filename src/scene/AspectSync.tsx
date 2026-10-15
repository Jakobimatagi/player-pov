import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { PerspectiveCamera } from 'three'

/** Keep the perspective camera's aspect matched to the viewport after a resize. */
export function AspectSync() {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const camera = useThree((s) => s.camera)

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const aspect = width / Math.max(height, 1)
    if (Math.abs(camera.aspect - aspect) < 1e-6) return
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }, [camera, width, height])

  return null
}
