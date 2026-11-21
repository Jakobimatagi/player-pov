import { useEffect, useId, useState } from 'react'
import {
  groupSlots,
  listSlots,
  listTeamPlayers,
  setSlot,
  type SlotRow,
  type TeamPlayer,
} from '../data/slots'
import type { CompiledPlay } from '../play/types'
import { watchChoices } from '../ui/watchLabel'

/**
 * Coach panel in the viewer: pick which roster players watch this play as which player.
 * A player holds one slot per play; a slot can hold several players (a depth chart).
 */
export function AssignSlots({
  play,
  playId,
  teamId,
  open,
  setOpen,
}: {
  play: CompiledPlay
  playId: string
  teamId: string
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const [players, setPlayers] = useState<TeamPlayer[]>([])
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const headingId = useId()

  useEffect(() => {
    if (!open) return
    let dead = false
    Promise.all([listTeamPlayers(teamId), listSlots(playId)])
      .then(([roster, rows]) => {
        if (dead) return
        setPlayers(roster)
        setSlots(rows)
      })
      .catch((err: unknown) => {
        if (!dead) setNote(err instanceof Error ? err.message : 'Could not load the roster')
      })
    return () => {
      dead = true
    }
  }, [open, playId, teamId])

  const assign = async (userId: string, slot: string | null) => {
    setBusy(true)
    setNote(null)
    try {
      await setSlot({ teamId, playId, userId, slot })
      setSlots((rows) => {
        const rest = rows.filter((row) => row.userId !== userId)
        return slot == null ? rest : [...rest, { userId, slot }]
      })
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const choices = watchChoices(play)
  const bySlot = groupSlots(slots)
  const names = new Map(players.map((p) => [p.userId, p.name]))
  const taken = new Set(slots.map((row) => row.userId))
  const groups = [
    { title: 'Defense', list: choices.defense },
    { title: 'Offense', list: choices.offense },
  ]

  return (
    <>
      <button
        type="button"
        className="btn assign-toggle"
        aria-expanded={open}
        data-testid="assign-toggle"
        onClick={() => {
          setNote(null)
          setOpen(!open)
        }}
      >
        Assign players
      </button>
      {open && (
        <section className="assign-panel" aria-labelledby={headingId} data-testid="assign-panel">
          <header className="assign-head">
            <h2 id={headingId}>Who watches as who</h2>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          <p className="assign-hint">
            An assigned player sees only their own player: helmet view, plus Broadcast and Top-down
            that follow them.
          </p>
          {note ? <p className="assign-note">{note}</p> : null}
          {groups.map((group) => (
            <div key={group.title} className="assign-group">
              <h3>{group.title}</h3>
              {group.list.map((choice) => {
                const holders = bySlot.get(choice.id) ?? []
                return (
                  <div key={choice.id} className="assign-row" data-testid={`assign-${choice.id}`}>
                    <span className="assign-slot">{choice.label}</span>
                    <span className="assign-holders">
                      {holders.map((userId) => (
                        <button
                          key={userId}
                          type="button"
                          className="btn assign-chip"
                          disabled={busy}
                          aria-label={`Remove ${names.get(userId) ?? 'player'} from ${choice.label}`}
                          onClick={() => void assign(userId, null)}
                        >
                          {names.get(userId) ?? 'Player'} ×
                        </button>
                      ))}
                      <select
                        className="assign-add"
                        aria-label={`Add a player to ${choice.label}`}
                        value=""
                        disabled={busy || players.length === 0}
                        onChange={(event) => {
                          const userId = event.currentTarget.value
                          if (userId !== '') void assign(userId, choice.id)
                        }}
                      >
                        <option value="">+ Add</option>
                        {players.map((p) => (
                          <option key={p.userId} value={p.userId}>
                            {p.name}
                            {p.position ? ` (${p.position})` : ''}
                            {taken.has(p.userId) ? ' — moves here' : ''}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      )}
    </>
  )
}
