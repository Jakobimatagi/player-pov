import { detectTags } from '../formations/library'
import type { LookSource } from '../play/sourceTypes'
import type { Facing } from './variants'
import { supabase } from './supabase'

export interface TeamLook {
  id: string
  name: string
  source: LookSource
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

/**
 * The team's charted looks on one side, with their current source. A defense studies the
 * team's `offense` looks: the formations it has charted from scouting.
 */
export async function listTeamLooks(
  teamId: string,
  side: 'offense' | 'defense',
): Promise<TeamLook[]> {
  const db = client()
  const { data: looks, error } = await db
    .from('scout_looks')
    .select('id, name, current_version')
    .eq('team_id', teamId)
    .eq('side', side)
    .not('current_version', 'is', null)
    .order('name')
  if (error) throw new Error(error.message)
  const rows = looks ?? []
  if (rows.length === 0) return []
  // Current versions only: a look can have many saved versions of up to 64KB each.
  const { data: versions, error: versionError } = await db
    .from('scout_look_versions')
    .select('look_id, version, source')
    .or(rows.map((row) => `and(look_id.eq.${row.id},version.eq.${row.current_version})`).join(','))
  if (versionError) throw new Error(versionError.message)
  const out: TeamLook[] = []
  for (const row of rows) {
    const current = (versions ?? []).find(
      (item) => item.look_id === row.id && item.version === row.current_version,
    )
    if (current == null) continue
    out.push({ id: row.id, name: row.name, source: current.source as unknown as LookSource })
  }
  return out
}

/**
 * The formation a saved play was charted against, tagged like the play sheet tags it.
 * The 3D viewer shows the answers against this one. Null when the play has no look.
 */
export async function loadChartedFacing(playId: string): Promise<Facing | null> {
  const db = client()
  const { data: play, error } = await db
    .from('plays')
    .select('default_look_id')
    .eq('id', playId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (play?.default_look_id == null) return null
  const { data: lookRow, error: lookError } = await db
    .from('scout_looks')
    .select('id, name, current_version')
    .eq('id', play.default_look_id)
    .maybeSingle()
  if (lookError) throw new Error(lookError.message)
  if (lookRow?.current_version == null) return null
  const { data: version, error: versionError } = await db
    .from('scout_look_versions')
    .select('source')
    .eq('look_id', lookRow.id)
    .eq('version', lookRow.current_version)
    .maybeSingle()
  if (versionError) throw new Error(versionError.message)
  if (version == null) return null
  const source = version.source as unknown as LookSource
  return { id: source.id ?? lookRow.id, name: lookRow.name, tags: detectTags(source) }
}
