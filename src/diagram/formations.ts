import { blankDiagram } from './model'
import { applyPreset, findPreset } from './presets'
import type { Diagram } from './types'

/**
 * A playbook's base alignment as a diagram: that offense preset's players at their spots.
 * Unknown or missing keys, and defense presets, give the blank line.
 */
export function diagramFromFormation(key: string | null): Diagram {
  const preset = findPreset(key)
  if (preset == null || preset.side !== 'offense') return blankDiagram()
  return applyPreset({ formation: '', players: [], lines: [], notes: [] }, preset)
}
