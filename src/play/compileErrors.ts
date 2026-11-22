import { MAX_WAYPOINTS } from './schema'
import type { LookSource, PlaySource } from './sourceTypes'
import type { PlayLoadError } from './types'

/**
 * Turn compile errors for a play + look pair into lines a coach can act on: which player
 * (by position, jersey and slot, and whether they are in the play or the look) and which
 * leg, instead of a compiled path like `players[14].waypoints[3]`. `compileChart` maps leg
 * errors back through the source map; this also maps the paths the source map has no
 * entry for (a player's whole track, their snap spot, the roster count).
 */

interface Who {
  side: 'play' | 'look'
  slot: string
  position: string
  jersey: number | undefined
  legs: readonly { label?: string }[]
}

const OURS = /^players\[([a-z][a-z0-9_]*)\](.*)$/i
const THEIRS = /^look\.players\[([a-z][a-z0-9_]*)\](.*)$/i
const COMPILED = /^players\[(\d+)\](.*)$/
const LEG = /^\.legs\[(\d+)\]/
const WAYPOINT = /^\.waypoints\[(\d+)\]/

function whoBySlot(source: PlaySource, look: LookSource, side: 'play' | 'look', slot: string) {
  const list = side === 'play' ? source.players : look.players
  const player = list.find((item) => item.slot === slot)
  if (player == null) return null
  return {
    side,
    slot,
    position: player.position,
    jersey: player.jersey,
    legs: player.legs,
  } satisfies Who
}

function whoByIndex(source: PlaySource, look: LookSource, index: number): Who | null {
  if (index < source.players.length) {
    const slot = source.players[index]?.slot
    return slot == null ? null : whoBySlot(source, look, 'play', slot)
  }
  const slot = look.players[index - source.players.length]?.slot
  return slot == null ? null : whoBySlot(source, look, 'look', slot)
}

/** "Look · CB #21 (cb_strong)" or "Play · WR #11 (h)". */
export function playerLabel(who: Who, lookName?: string): string {
  const number = who.jersey != null ? ` #${who.jersey}` : ''
  const where = who.side === 'play' ? 'Play' : lookName != null ? `Look “${lookName}”` : 'Look'
  return `${where} · ${who.position}${number} (${who.slot})`
}

function legName(who: Who, index: number): string {
  const label = who.legs[index]?.label
  return label != null && label !== '' ? `leg ${index + 1} “${label}”` : `leg ${index + 1}`
}

function plainMessage(message: string, who: Who | null): string {
  const speed = /^speed ([\d.]+) yd\/s > (\d+)$/.exec(message)
  if (speed != null) {
    return `too fast: ${speed[1]} yd/s, the most a player can run is ${speed[2]} yd/s. Give the leg more time.`
  }
  if (/expected array to have <=\s*12|Too big/i.test(message) && who != null) {
    return `has ${who.legs.length} legs, over the cap of ${MAX_WAYPOINTS} waypoints (${MAX_WAYPOINTS - 1} legs at most). Remove a leg.`
  }
  if (message === 'wrong side of LOS at snap') {
    return 'lines up on the wrong side of the line of scrimmage at the snap'
  }
  const count = /^expected 11 offense and 11 defense, found (\d+) and (\d+)$/.exec(message)
  if (count != null) {
    return `needs 11 players on each side, but the offense has ${count[1]} and the defense has ${count[2]}. A slot is missing.`
  }
  return message
}

/**
 * Readable copies of `errors` (already source-mapped by compileChart). `playerId` becomes
 * the player's label, so the error screen groups by player, and `path` names the leg.
 */
export function readableCompileErrors(
  errors: readonly PlayLoadError[],
  source: PlaySource,
  look: LookSource,
): PlayLoadError[] {
  return errors.map((error) => {
    let who: Who | null = null
    let rest = ''
    const ours = OURS.exec(error.path)
    const theirs = ours == null ? THEIRS.exec(error.path) : null
    const compiled = ours == null && theirs == null ? COMPILED.exec(error.path) : null
    if (ours != null) {
      who = whoBySlot(source, look, 'play', ours[1] ?? '')
      rest = ours[2] ?? ''
    } else if (theirs != null) {
      who = whoBySlot(source, look, 'look', theirs[1] ?? '')
      rest = theirs[2] ?? ''
    } else if (compiled != null) {
      who = whoByIndex(source, look, Number(compiled[1]))
      rest = compiled[2] ?? ''
    }
    if (who == null) {
      const where = error.path.startsWith('look')
        ? `Look “${look.name}”`
        : error.path.startsWith('ball')
          ? 'Ball'
          : 'Play'
      return {
        ...error,
        playerId: where,
        path: error.path === '' ? 'play' : error.path,
        message: plainMessage(error.message, null),
      }
    }
    const leg = LEG.exec(rest)
    const waypoint = WAYPOINT.exec(rest)
    const at =
      leg != null
        ? legName(who, Number(leg[1]))
        : waypoint != null && Number(waypoint[1]) === 0
          ? 'snap spot'
          : waypoint != null
            ? legName(who, Number(waypoint[1]) - 1)
            : 'route'
    return {
      ...error,
      playerId: playerLabel(who, who.side === 'look' ? look.name : undefined),
      path: at,
      message: plainMessage(error.message, who),
    }
  })
}
