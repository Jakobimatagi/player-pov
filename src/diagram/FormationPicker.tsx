import { useState } from 'react'
import { DiagramScene } from './DiagramScene'
import {
  DEFENSE_PRESETS,
  OFFENSE_PRESETS,
  presetDiagram,
  type Preset,
  type PresetSide,
} from './presets'
import {
  copyName,
  liveTemplates,
  spotsFromDiagram,
  templateNameError,
  templatePreset,
  type FormationTemplate,
} from './templates'
import type { ScenePalette } from './theme'
import type { Diagram } from './types'
import type { TemplatesState } from './useFormationTemplates'

type Note = { kind: 'ok' | 'error'; text: string }
type Editing =
  | { kind: 'save'; name: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string }
  | null

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.'

function Card({
  preset,
  palette,
  onApply,
}: {
  preset: Preset
  palette: ScenePalette
  onApply: (preset: Preset) => void
}) {
  return (
    <button
      type="button"
      className="dge-card"
      onClick={() => onApply(preset)}
      aria-label={`Set ${preset.name}`}
    >
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
  )
}

/**
 * One-click formations. Picking one sets that side's players on the field, ready to drag.
 * The other side stays, so a coach can set an offense and then a defense against it.
 * The team's own formations sit above the built-ins; a coach saves the field as one, and can
 * start one from a built-in with Duplicate.
 */
export function FormationPicker({
  palette,
  diagram,
  hasDefense,
  hasOffense,
  templates,
  canEdit,
  onApply,
  onClear,
}: {
  palette: ScenePalette
  diagram: Diagram
  hasDefense: boolean
  hasOffense: boolean
  templates: TemplatesState
  /** Whether this coach may save formations on a side (the database checks it too). */
  canEdit: (side: PresetSide) => boolean
  onApply: (preset: Preset) => void
  onClear: (side: PresetSide) => void
}) {
  const [side, setSide] = useState<PresetSide>('offense')
  const [editing, setEditing] = useState<Editing>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [busy, setBusy] = useState(false)
  const list = side === 'offense' ? OFFENSE_PRESETS : DEFENSE_PRESETS
  const present = side === 'offense' ? hasOffense : hasDefense
  const mine = liveTemplates(templates.templates, side)
  const editable = templates.available && canEdit(side)

  function pickSide(next: PresetSide) {
    setSide(next)
    setEditing(null)
    setNote(null)
  }

  async function run(work: () => Promise<string>) {
    setBusy(true)
    try {
      const text = await work()
      setNote({ kind: 'ok', text })
      setEditing(null)
    } catch (error) {
      setNote({ kind: 'error', text: message(error) })
    } finally {
      setBusy(false)
    }
  }

  function save(name: string) {
    const problem = templateNameError(name, side, templates.templates)
    if (problem != null) return setNote({ kind: 'error', text: problem })
    const result = spotsFromDiagram(diagram, side)
    if ('error' in result) return setNote({ kind: 'error', text: result.error })
    void run(async () => {
      const saved = await templates.save(side, name, result.spots)
      return `Saved “${saved.name}” to My formations.`
    })
  }

  function rename(template: FormationTemplate, name: string) {
    const problem = templateNameError(name, side, templates.templates, template.id)
    if (problem != null) return setNote({ kind: 'error', text: problem })
    void run(async () => {
      const saved = await templates.update(template, { name })
      return `Renamed to “${saved.name}”.`
    })
  }

  function matchField(template: FormationTemplate) {
    const result = spotsFromDiagram(diagram, side)
    if ('error' in result) return setNote({ kind: 'error', text: result.error })
    void run(async () => {
      await templates.update(template, { spots: result.spots })
      return `“${template.name}” now matches the field.`
    })
  }

  function archive(template: FormationTemplate) {
    void run(async () => {
      await templates.archive(template)
      return `Deleted “${template.name}”. Playbooks that use it keep it.`
    })
  }

  function duplicate(preset: Preset) {
    void run(async () => {
      const saved = await templates.save(
        side,
        copyName(preset.name, side, templates.templates),
        preset.spots,
      )
      onApply(templatePreset(saved))
      return `Saved “${saved.name}” and set it on the field. Move players, then choose Match field.`
    })
  }

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
              onClick={() => pickSide(s)}
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
        {editable ? (
          <button
            type="button"
            className="dge-btn"
            aria-expanded={editing?.kind === 'save'}
            onClick={() => {
              setNote(null)
              setEditing(editing?.kind === 'save' ? null : { kind: 'save', name: '' })
            }}
          >
            Save as formation
          </button>
        ) : null}
        <button type="button" className="dge-btn" disabled={!present} onClick={() => onClear(side)}>
          Remove {side}
        </button>
      </div>

      {editing?.kind === 'save' ? (
        <form
          className="dge-save-form"
          onSubmit={(event) => {
            event.preventDefault()
            save(editing.name)
          }}
        >
          <input
            aria-label={`Name for this ${side} formation`}
            placeholder="Name, e.g. Our Wing-T Right"
            maxLength={40}
            value={editing.name}
            onChange={(event) => setEditing({ kind: 'save', name: event.target.value })}
            autoFocus
          />
          <button type="submit" className="dge-btn" disabled={busy}>
            Save {side}
          </button>
          <button type="button" className="dge-btn" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </form>
      ) : null}

      {note != null ? (
        <p
          className="dge-formations-note"
          data-kind={note.kind}
          role={note.kind === 'error' ? 'alert' : 'status'}
        >
          {note.text}
        </p>
      ) : null}

      {templates.available ? (
        <section aria-label="My formations">
          <h3 className="dge-group-title">My formations</h3>
          {templates.error != null ? (
            <p className="dge-group-empty" role="alert">
              {templates.error}
            </p>
          ) : !templates.loaded ? (
            <p className="dge-group-empty">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="dge-group-empty">
              No saved {side} formations yet.
              {editable ? ' Set 11 players on the field and choose Save as formation.' : ''}
            </p>
          ) : (
            <ul className="dge-presets">
              {mine.map((template) => (
                <li key={template.id}>
                  <Card preset={templatePreset(template)} palette={palette} onApply={onApply} />
                  {editing?.kind === 'rename' && editing.id === template.id ? (
                    <form
                      className="dge-card-actions"
                      onSubmit={(event) => {
                        event.preventDefault()
                        rename(template, editing.name)
                      }}
                    >
                      <input
                        aria-label={`New name for ${template.name}`}
                        maxLength={40}
                        value={editing.name}
                        onChange={(event) =>
                          setEditing({ kind: 'rename', id: template.id, name: event.target.value })
                        }
                        autoFocus
                      />
                      <button type="submit" className="dge-link" disabled={busy}>
                        Save
                      </button>
                      <button type="button" className="dge-link" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : editing?.kind === 'delete' && editing.id === template.id ? (
                    <div className="dge-card-actions" role="group" aria-label="Confirm delete">
                      <span>Delete? Playbooks that use it keep it.</span>
                      <button
                        type="button"
                        className="dge-link"
                        data-danger="true"
                        disabled={busy}
                        onClick={() => archive(template)}
                      >
                        Delete
                      </button>
                      <button type="button" className="dge-link" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : editable ? (
                    <div className="dge-card-actions">
                      <button
                        type="button"
                        className="dge-link"
                        aria-label={`Rename ${template.name}`}
                        onClick={() => {
                          setNote(null)
                          setEditing({ kind: 'rename', id: template.id, name: template.name })
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="dge-link"
                        aria-label={`Make ${template.name} match the field`}
                        disabled={busy}
                        onClick={() => matchField(template)}
                      >
                        Match field
                      </button>
                      <button
                        type="button"
                        className="dge-link"
                        data-danger="true"
                        aria-label={`Delete ${template.name}`}
                        onClick={() => {
                          setNote(null)
                          setEditing({ kind: 'delete', id: template.id })
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {templates.available ? <h3 className="dge-group-title">Built-in</h3> : null}
      <ul className="dge-presets">
        {list.map((preset) => (
          <li key={preset.key}>
            <Card preset={preset} palette={palette} onApply={onApply} />
            {editable ? (
              <div className="dge-card-actions">
                <button
                  type="button"
                  className="dge-link"
                  aria-label={`Duplicate ${preset.name}`}
                  disabled={busy}
                  onClick={() => duplicate(preset)}
                >
                  Duplicate
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
