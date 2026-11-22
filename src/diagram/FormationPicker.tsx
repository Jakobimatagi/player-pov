import { useState } from 'react'
import { DiagramScene } from './DiagramScene'
import {
  DEFENSE_PRESETS,
  OFFENSE_PRESETS,
  presetDiagram,
  type Preset,
  type PresetSide,
} from './presets'
import type { ScenePalette } from './theme'

/**
 * One-click formations. Picking one sets that side's players on the field, ready to drag.
 * The other side stays, so a coach can set an offense and then a defense against it.
 */
export function FormationPicker({
  palette,
  hasDefense,
  hasOffense,
  onApply,
  onClear,
}: {
  palette: ScenePalette
  hasDefense: boolean
  hasOffense: boolean
  onApply: (preset: Preset) => void
  onClear: (side: PresetSide) => void
}) {
  const [side, setSide] = useState<PresetSide>('offense')
  const list = side === 'offense' ? OFFENSE_PRESETS : DEFENSE_PRESETS
  const present = side === 'offense' ? hasOffense : hasDefense
  return (
    <div className="dge-formations" role="region" aria-label="Formations">
      <div className="dge-formations-bar">
        <div role="tablist" aria-label="Side" className="dge-tabs">
          {(['offense', 'defense'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              className="dge-tab"
              onClick={() => setSide(s)}
            >
              {s === 'offense' ? 'Offense' : 'Defense'}
            </button>
          ))}
        </div>
        <span className="dge-formations-hint">
          {side === 'offense'
            ? 'Replaces the offense. Defense stays.'
            : 'Adds a defense across from the offense.'}
        </span>
        <button type="button" className="dge-btn" disabled={!present} onClick={() => onClear(side)}>
          Remove {side}
        </button>
      </div>
      <ul className="dge-presets">
        {list.map((preset) => (
          <li key={preset.key}>
            <button type="button" onClick={() => onApply(preset)} aria-label={`Set ${preset.name}`}>
              <span className="dge-preview" style={{ aspectRatio: '260 / 146' }}>
                <DiagramScene
                  diagram={presetDiagram(preset)}
                  width={260}
                  height={146}
                  zoom={1.35}
                  interactive={false}
                  palette={palette}
                />
              </span>
              <span>{preset.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
