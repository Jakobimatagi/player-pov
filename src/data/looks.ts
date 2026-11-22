import type { LookSource } from '../play/sourceTypes'
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
  const { data: versions, error: versionError } = await db
    .from('scout_look_versions')
    .select('look_id, version, source')
    .in(
      'look_id',
      rows.map((row) => row.id),
    )
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
