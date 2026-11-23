import { useThemePalette } from '../theme/useScenePalette'

/** The scene background, from the theme's `--field-sky`. */
export function Sky() {
  const sky = useThemePalette().field.sky
  return <color attach="background" args={[sky]} />
}
