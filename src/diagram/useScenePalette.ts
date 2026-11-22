import { useState } from 'react'
import { resolvePalette, type ScenePalette } from './theme'

/** The scene colours for the app's theme, read once when the component mounts. */
export function useScenePalette(): ScenePalette {
  const [palette] = useState(resolvePalette)
  return palette
}
