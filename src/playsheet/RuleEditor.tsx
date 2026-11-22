import { useEffect, useId, useState, type FormEvent } from 'react'
import type { Side } from '../data/database.types'
import './playsheet.css'
import {
  EMPTY_RULE,
  PHASE_LABEL,
  RULE_FIELDS,
  missingFields,
  type RuleFields,
  type RulePhase,
} from '../data/rules'

const PHASES: readonly RulePhase[] = ['pre', 'post', 'extra']

function pick(rule: RuleFields | null | undefined): RuleFields {
  const out = { ...EMPTY_RULE }
  if (rule == null) return out
  for (const field of RULE_FIELDS) out[field.key] = rule[field.key]
  return out
}

/** Read-only A's and R's, grouped Pre-snap / Post-snap. */
export function RuleView({
  rule,
  required,
  compact = false,
  tags,
}: {
  rule: RuleFields | null | undefined
  /** Our side: blanks show as missing. Scout look: blanks are skipped. */
  required: boolean
  compact?: boolean
  /** Answers that come from a "vs" exception, with the exception's short name. */
  tags?: Partial<Record<keyof RuleFields, string>>
}) {
  const fields = pick(rule)
  return (
    <div className="rule-view" data-compact={compact ? 'true' : undefined}>
      {PHASES.map((phase) => {
        const list = RULE_FIELDS.filter((field) => field.phase === phase).filter(
          (field) => fields[field.key].trim() !== '' || (required && field.required),
        )
        if (list.length === 0) return null
        return (
          <section key={phase} className="rule-phase" data-phase={phase}>
            {phase === 'extra' ? null : <h4>{PHASE_LABEL[phase]}</h4>}
            <dl>
              {list.map((field) => {
                const value = fields[field.key].trim()
                const tag = tags?.[field.key]
                return (
                  <div
                    key={field.key}
                    className="rule-line"
                    data-missing={value === '' ? 'true' : undefined}
                    data-variant={tag != null ? 'true' : undefined}
                  >
                    <dt>
                      {field.label}
                      {tag != null ? <span className="rule-vs">vs {tag}</span> : null}
                      {compact ? null : <span className="rule-question">{field.question}</span>}
                    </dt>
                    <dd>{value === '' ? 'Not answered yet' : value}</dd>
                  </div>
                )
              })}
            </dl>
          </section>
        )
      })}
    </div>
  )
}

/**
 * The six answers as a form. Required answers that are still blank are flagged so the
 * coach sees what blocks publishing. Read-only when the viewer can't edit this side.
 */
export function RuleEditor({
  initial,
  editable,
  required,
  side,
  onSave,
}: {
  initial: RuleFields | null | undefined
  editable: boolean
  /** Our side owes all six. The scout look is optional. */
  required: boolean
  side: Side
  onSave: (fields: RuleFields) => Promise<void>
}) {
  const [fields, setFields] = useState<RuleFields>(() => pick(initial))
  const [status, setStatus] = useState<{
    kind: 'idle' | 'busy' | 'saved' | 'error'
    text?: string
  }>({ kind: 'idle' })
  const formId = useId()
  const missing = required ? missingFields(fields) : []

  useEffect(() => {
    if (status.kind !== 'saved') return
    const id = window.setTimeout(() => setStatus({ kind: 'idle' }), 2000)
    return () => window.clearTimeout(id)
  }, [status.kind])

  if (!editable) {
    return (
      <div className="rule-form">
        <RuleView rule={initial} required={required} />
        <p className="assign-hint">
          Only the head coach or the {side} coordinator can change these.
        </p>
      </div>
    )
  }

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
      {PHASES.map((phase) => (
        <fieldset key={phase} className="rule-phase" data-phase={phase}>
          <legend>{PHASE_LABEL[phase]}</legend>
          {RULE_FIELDS.filter((field) => field.phase === phase).map((field) => {
            const blank = required && field.required && fields[field.key].trim() === ''
            const id = `${formId}-${field.key}`
            return (
              <label
                key={field.key}
                className="rule-field"
                htmlFor={id}
                data-missing={blank ? 'true' : undefined}
              >
                <span className="rule-field-label">
                  {field.label}
                  {required && field.required ? (
                    <span className="rule-required" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  ) : null}
                  <span className="rule-question">{field.question}</span>
                </span>
                <textarea
                  id={id}
                  rows={field.key === 'notes' ? 3 : 2}
                  maxLength={field.max}
                  placeholder={field.hint}
                  aria-required={required && field.required}
                  aria-invalid={blank}
                  value={fields[field.key]}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setFields((current) => ({ ...current, [field.key]: value }))
                  }}
                />
              </label>
            )
          })}
        </fieldset>
      ))}
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
        {required && status.kind !== 'error' ? (
          <span className="rule-left" data-testid="rule-left">
            {missing.length === 0
              ? 'All 3 A’s and 3 R’s answered'
              : `Still needed: ${missing.map((field) => field.label).join(', ')}`}
          </span>
        ) : null}
      </div>
    </form>
  )
}

/**
 * One "vs" exception layer: only the answers that change against this formation,
 * structure or personnel group. Each blank shows what it inherits.
 */
export function VariantEditor({
  initial,
  inherited,
  editable,
  label,
  side,
  onSave,
}: {
  initial: RuleFields | null | undefined
  /** What each answer is without this exception. */
  inherited: RuleFields
  editable: boolean
  label: string
  side: Side
  onSave: (fields: RuleFields) => Promise<void>
}) {
  const [fields, setFields] = useState<RuleFields>(() => pick(initial))
  const [status, setStatus] = useState<{
    kind: 'idle' | 'busy' | 'saved' | 'error'
    text?: string
  }>({ kind: 'idle' })
  const formId = useId()
  const changed = RULE_FIELDS.filter((field) => fields[field.key].trim() !== '').length

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
    <form className="rule-form variant-form" onSubmit={(event) => void submit(event)}>
      <p className="assign-hint">
        Fill in only what changes {label}. Blank answers keep the rule shown underneath them.
      </p>
      {PHASES.map((phase) => (
        <fieldset key={phase} className="rule-phase" data-phase={phase}>
          <legend>{PHASE_LABEL[phase]}</legend>
          {RULE_FIELDS.filter((field) => field.phase === phase).map((field) => {
            const id = `${formId}-${field.key}`
            const below = inherited[field.key].trim()
            const own = fields[field.key].trim() !== ''
            return (
              <label
                key={field.key}
                className="rule-field"
                htmlFor={id}
                data-variant={own ? 'true' : undefined}
              >
                <span className="rule-field-label">
                  {field.label}
                  <span className="rule-question">{field.question}</span>
                </span>
                <textarea
                  id={id}
                  rows={2}
                  maxLength={field.max}
                  readOnly={!editable}
                  placeholder={editable ? 'Same as below' : ''}
                  value={fields[field.key]}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setFields((current) => ({ ...current, [field.key]: value }))
                  }}
                />
                <span className="rule-inherits" data-overridden={own ? 'true' : undefined}>
                  {below === '' ? 'Nothing underneath yet' : `Otherwise: ${below}`}
                </span>
              </label>
            )
          })}
        </fieldset>
      ))}
      {editable ? (
        <div className="rule-actions">
          <button type="submit" className="btn primary" disabled={status.kind === 'busy'}>
            Save exception
          </button>
          {status.kind === 'saved' ? <span role="status">Saved</span> : null}
          {status.kind === 'error' ? (
            <span className="assign-note" role="alert">
              {status.text}
            </span>
          ) : (
            <span className="rule-left">
              {changed === 0
                ? 'No changes yet: saving removes this exception'
                : `${changed} answer${changed === 1 ? '' : 's'} change ${label}`}
            </span>
          )}
        </div>
      ) : (
        <p className="assign-hint">
          Only the head coach or the {side} coordinator can change these.
        </p>
      )}
    </form>
  )
}
