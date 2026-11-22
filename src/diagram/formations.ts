import { blankDiagram } from './model'
import { applyPreset } from './presets'
import { resolveFormation, type FormationTemplate } from './templates'
import type { Diagram } from './types'

/**
 * A playbook's base alignment as a diagram: that offense formation's players at their spots.
 * The key is a built-in preset or a team template (`tpl:<id>`, looked up in `templates`).
 * Unknown or missing keys, and defense formations, give the blank line.
 */
export function diagramFromFormation(
  key: string | null,
  templates: readonly FormationTemplate[] = [],
): Diagram {
  const preset = resolveFormation(key, templates)
  if (preset == null || preset.side !== 'offense') return blankDiagram()
  return applyPreset({ formation: '', players: [], lines: [], notes: [] }, preset)
}
