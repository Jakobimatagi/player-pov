import { useEffect, useState } from 'react'
import { cameraState, subscribeCamera } from '../camera/cameraState'
import type { PositionRule } from '../data/rules'
import { RuleView } from '../playsheet/RuleEditor'
import type { CompiledPlay } from '../play/types'
import { watchLabel } from '../ui/watchLabel'

/** The rules for whoever the camera follows. A locked player always sees their own. */
export function RuleCard({
  play,
  rules,
  locked,
}: {
  play: CompiledPlay
  rules: readonly PositionRule[]
  locked: boolean
}) {
  const [attached, setAttached] = useState(cameraState.attached)
  useEffect(() => subscribeCamera(() => setAttached(cameraState.attached)), [])

  if (attached < 0) return null
  const slot = play.ids[attached] ?? ''
  const rule = rules.find((item) => item.slot === slot)
  if (rule == null && !locked) return null
  const label = watchLabel(slot, play.positions[attached] ?? '', play.jerseys[attached] ?? 0)

  return (
    <details className="rule-card" open data-testid="rule-card">
      <summary>{locked ? `Your job: ${label}` : `${label} rules`}</summary>
      {rule == null ? (
        <p className="rule-empty">Your coach hasn&apos;t written rules for this play yet.</p>
      ) : (
        <RuleView rule={rule} required={false} compact />
      )}
    </details>
  )
}
