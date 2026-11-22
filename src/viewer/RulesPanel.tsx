import { useId, useState } from 'react'
import { Link } from 'react-router'
import { canEditSide, SIDE_LABEL } from '../auth/sides'
import { cameraState } from '../camera/cameraState'
import type { Side, StaffSide, TeamRole } from '../data/database.types'
import { saveRule, type PositionRule } from '../data/rules'
import { RuleEditor } from '../playsheet/RuleEditor'
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
            Players see the rules for their own position while they watch.{' '}
            <Link to={`/plays/${playId}`}>Open the play sheet</Link> to see every position on the
            board, check what is missing, and publish.
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
                        <RuleEditor
                          key={`${choice.id}:${rulesVersion}`}
                          initial={rule}
                          editable={editable}
                          required={false}
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
