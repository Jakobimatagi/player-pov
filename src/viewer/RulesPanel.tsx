import { useEffect, useId, useState, type FormEvent } from 'react'
import { canEditSide, SIDE_LABEL } from '../auth/sides'
import { cameraState } from '../camera/cameraState'
import type { Side, StaffSide, TeamRole } from '../data/database.types'
import {
  EMPTY_RULE,
  RULE_FIELDS,
  saveRule,
  type PositionRule,
  type RuleFields,
} from '../data/rules'
import type { CompiledPlay } from '../play/types'
import { watchChoices } from '../ui/watchLabel'

/**
 * Coach panel: write per-position rules for this play. Each player's side comes from the
 * play, so the offensive coordinator edits offense players and the defensive coordinator
 * edits defense players. The head coach edits all of them.
 */
export function RulesPanel({
  play,
  playId,
  teamId,
  role,
  mySide,
  rules,
  rulesVersion = 0,
  onSaved,
  open,
  setOpen,
}: {
  play: CompiledPlay
  playId: string
  teamId: string
  role: TeamRole | null
  mySide: StaffSide | null
  rules: readonly PositionRule[]
  /** Changes when rules are refetched; open forms reset only then. */
  rulesVersion?: number
  onSaved: (slot: string, rule: PositionRule | null) => void
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const choices = watchChoices(play)
  const ownFirst: Side[] = mySide === 'offense' ? ['offense', 'defense'] : ['defense', 'offense']
  const groups = ownFirst.map((side) => ({
    side,
    list: side === 'offense' ? choices.offense : choices.defense,
  }))
  const [slot, setSlot] = useState<string | null>(null)
  const headingId = useId()

  return (
    <>
      <button
        type="button"
        className="btn rules-toggle"
        aria-expanded={open}
        data-testid="rules-toggle"
        onClick={() => {
          if (!open) {
            const attached = cameraState.attached
            setSlot(attached >= 0 ? (play.ids[attached] ?? null) : null)
          }
          setOpen(!open)
        }}
      >
        Position rules
      </button>
      {open && (
        <section className="assign-panel" aria-labelledby={headingId} data-testid="rules-panel">
          <header className="assign-head">
            <h2 id={headingId}>Position rules</h2>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          <p className="assign-hint">
            Players see the rules for their own position while they watch.
            {(mySide === 'offense' || mySide === 'defense') && role !== 'head_coach'
              ? ` As ${mySide === 'offense' ? 'offensive' : 'defensive'} coordinator you edit ${SIDE_LABEL[mySide].toLowerCase()} players.`
              : ''}
            {mySide === 'special' && role !== 'head_coach'
              ? ' As special teams coordinator you can read these rules. Special teams plays are not in the 3D viewer yet.'
              : ''}
          </p>
          {groups.map((group) => {
            const editable = canEditSide(role, mySide, group.side)
            return (
              <div key={group.side} className="assign-group">
                <h3>
                  {SIDE_LABEL[group.side]}
                  {editable ? '' : ' · view only'}
                </h3>
                {group.list.map((choice) => {
                  const rule = rules.find((item) => item.slot === choice.id)
                  const isOpen = slot === choice.id
                  return (
                    <div key={choice.id} className="rule-row" data-testid={`rule-${choice.id}`}>
                      <button
                        type="button"
                        className="rule-row-head"
                        aria-expanded={isOpen}
                        onClick={() => setSlot(isOpen ? null : choice.id)}
                      >
                        <span className="assign-slot">{choice.label}</span>
                        <span className="rule-summary">
                          {rule == null
                            ? 'No rules yet'
                            : rule.assignment || rule.alignment || 'Notes'}
                        </span>
                      </button>
                      {isOpen ? (
                        <RuleForm
                          key={`${choice.id}:${rulesVersion}`}
                          initial={rule ?? EMPTY_RULE}
                          editable={editable}
                          side={group.side}
                          onSave={async (fields) => {
                            const result = await saveRule({
                              teamId,
                              playId,
                              slot: choice.id,
                              side: group.side,
                              rule: fields,
                            })
                            onSaved(
                              choice.id,
                              result === 'deleted'
                                ? null
                                : {
                                    ...fields,
                                    slot: choice.id,
                                    side: group.side,
                                    updatedAt: new Date().toISOString(),
                                  },
                            )
                          }}
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>
      )}
    </>
  )
}

function RuleForm({
  initial,
  editable,
  side,
  onSave,
}: {
  initial: RuleFields
  editable: boolean
  side: Side
  onSave: (fields: RuleFields) => Promise<void>
}) {
  const [fields, setFields] = useState<RuleFields>({
    alignment: initial.alignment,
    assignment: initial.assignment,
    keyRead: initial.keyRead,
    notes: initial.notes,
  })
  const [status, setStatus] = useState<{
    kind: 'idle' | 'busy' | 'saved' | 'error'
    text?: string
  }>({ kind: 'idle' })
  const formId = useId()

  useEffect(() => {
    if (status.kind !== 'saved') return
    const id = window.setTimeout(() => setStatus({ kind: 'idle' }), 2000)
    return () => window.clearTimeout(id)
  }, [status.kind])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setStatus({ kind: 'busy' })
    try {
      await onSave(fields)
      setStatus({ kind: 'saved' })
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save' })
    }
  }

  return (
    <form className="rule-form" onSubmit={(event) => void submit(event)}>
      {RULE_FIELDS.map((field) => (
        <label key={field.key} className="rule-field" htmlFor={`${formId}-${field.key}`}>
          <span>{field.label}</span>
          <textarea
            id={`${formId}-${field.key}`}
            rows={field.key === 'notes' ? 3 : 2}
            maxLength={field.max}
            placeholder={editable ? field.hint : ''}
            readOnly={!editable}
            value={fields[field.key]}
            onChange={(event) => {
              const value = event.currentTarget.value
              setFields((current) => ({ ...current, [field.key]: value }))
            }}
          />
        </label>
      ))}
      {editable ? (
        <div className="rule-actions">
          <button type="submit" className="btn primary" disabled={status.kind === 'busy'}>
            Save
          </button>
          {status.kind === 'saved' ? <span role="status">Saved</span> : null}
          {status.kind === 'error' ? (
            <span className="assign-note" role="alert">
              {status.text}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="assign-hint">
          Only the head coach or the {side} coordinator can change these.
        </p>
      )}
    </form>
  )
}
