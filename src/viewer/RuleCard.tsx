import { useEffect, useState } from 'react'
import { cameraState, subscribeCamera } from '../camera/cameraState'
import type { PositionRule, RuleFields } from '../data/rules'
import { resolveRule, targetTag, type Facing, type RuleVariant } from '../data/variants'
import { RuleView } from '../playsheet/RuleEditor'
import type { CompiledPlay } from '../play/types'
import { watchLabel } from '../ui/watchLabel'

/**
 * The rules for whoever the camera follows. A locked player always sees their own.
 * Answers come out the same as on the play sheet: the base rule, with any "vs"
 * exceptions for the formation the play was charted against.
 */
export function RuleCard({
  play,
  rules,
  locked,
  variants = [],
  facing = null,
}: {
  play: CompiledPlay
  rules: readonly PositionRule[]
  locked: boolean
  variants?: readonly RuleVariant[]
  facing?: Facing | null
}) {
  const [attached, setAttached] = useState(cameraState.attached)
  useEffect(() => subscribeCamera(() => setAttached(cameraState.attached)), [])

  if (attached < 0) return null
  const slot = play.ids[attached] ?? ''
  const base = rules.find((item) => item.slot === slot)
  const resolved = resolveRule(base, variants, slot, facing)
  const tags: Partial<Record<keyof RuleFields, string>> = {}
  for (const [key, target] of Object.entries(resolved.from)) {
    if (target != null) tags[key as keyof RuleFields] = targetTag(target)
  }
  const rule = base != null || Object.keys(tags).length > 0 ? resolved.fields : null
  if (rule == null && !locked) return null
  const label = watchLabel(slot, play.positions[attached] ?? '', play.jerseys[attached] ?? 0)

  return (
    <details className="rule-card" open data-testid="rule-card">
      <summary>{locked ? `Your job: ${label}` : `${label} rules`}</summary>
      {rule == null ? (
        <p className="rule-empty">Your coach hasn&apos;t written rules for this play yet.</p>
      ) : (
        <RuleView rule={rule} required={false} compact tags={tags} />
      )}
    </details>
  )
}
