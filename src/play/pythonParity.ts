import type { PlayFile } from './types'

function at(wps: PlayFile['players'][number]['waypoints'], t: number, key: 'x' | 'y'): number {
  const first = wps[0]
  if (first == null || t <= first.t) return first?.[key] ?? 0
  for (let i = 0; i < wps.length - 1; i += 1) {
    const a = wps[i]
    const b = wps[i + 1]
    if (a == null || b == null) continue
    if (a.t <= t && t <= b.t) {
      const span = b.t - a.t
      const u = span === 0 ? 0 : (t - a.t) / span
      return a[key] + (b[key] - a[key]) * u
    }
  }
  return wps[wps.length - 1]?.[key] ?? 0
}

/** The same semantic lines `schema/validate.py` prints, in the same order. */
export function pythonSemanticErrors(play: PlayFile): string[] {
  const errs: string[] = []
  const ids = new Set<string>()
  const jerseys: Record<'offense' | 'defense', Set<number>> = {
    offense: new Set(),
    defense: new Set(),
  }
  const counts = { offense: 0, defense: 0 }
  const duration = play.meta.duration
  for (const player of play.players) {
    if (ids.has(player.id)) errs.push(`dup id ${player.id}`)
    ids.add(player.id)
    counts[player.team] += 1
    if (jerseys[player.team].has(player.jersey)) errs.push(`dup jersey ${player.id}`)
    jerseys[player.team].add(player.jersey)
    const wps = player.waypoints
    const first = wps[0]
    const last = wps[wps.length - 1]
    if (first != null && first.t > 0) {
      errs.push(`${player.id} first t must be <= 0 (t<0 = pre-snap)`)
    }
    if (last != null && last.t !== duration) errs.push(`${player.id} last t!=duration`)
    for (let i = 0; i < wps.length - 1; i += 1) {
      const a = wps[i]
      const b = wps[i + 1]
      if (a == null || b == null) continue
      if (b.t <= a.t) {
        errs.push(`${player.id} t not increasing`)
        continue
      }
      const speed = Math.hypot(b.x - a.x, b.y - a.y) / (b.t - a.t)
      if (speed > 11) errs.push(`${player.id} speed ${speed.toFixed(1)} yd/s > 11`)
    }
    if (first != null) {
      const x0 = at(wps, 0, 'x')
      if ((player.team === 'offense') !== x0 < play.meta.lineOfScrimmageX) {
        errs.push(`${player.id} wrong side of LOS at snap`)
      }
    }
  }
  const segs = play.ball.segments
  const seg0 = segs[0]
  const segN = segs[segs.length - 1]
  if (seg0 != null && seg0.t0 > 0) errs.push('ball must exist at snap (first t0 <= 0)')
  if (segN != null && segN.t1 !== duration) errs.push('ball last t1 != duration')
  for (const seg of segs) {
    if (seg.t1 <= seg.t0) errs.push(`ball segment t1<=t0 at ${seg.t0}`)
    const refs =
      seg.kind === 'carried'
        ? [['carrier', seg.carrier] as const]
        : ([
            ['from', seg.from],
            ['to', seg.to],
          ] as const)
    for (const [key, id] of refs) {
      if (!ids.has(id)) errs.push(`ball ${key} unknown id ${id}`)
    }
  }
  for (let i = 0; i < segs.length - 1; i += 1) {
    const a = segs[i]
    const b = segs[i + 1]
    if (a == null || b == null) continue
    if (Math.abs(a.t1 - b.t0) > 1e-9) errs.push(`ball gap/overlap at ${a.t1}`)
    const end = a.kind === 'carried' ? a.carrier : a.to
    const start = b.kind === 'carried' ? b.carrier : b.from
    if (end !== start) errs.push(`ball handoff mismatch at ${a.t1}: ${end} -> ${start}`)
  }
  if (counts.offense !== 11 || counts.defense !== 11) {
    errs.push(`counts {'offense': ${counts.offense}, 'defense': ${counts.defense}}`)
  }
  return errs
}
