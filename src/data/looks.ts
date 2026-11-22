import { detectTags } from '../formations/library'
import type { LookOption } from '../play/lookChoice'
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

/** One saved look at its current version, for the viewer. */
export interface SavedLook {
  id: string
  name: string
  side: 'offense' | 'defense'
  version: number
  source: LookSource
}

/**
 * A saved look at its current version, or null when the caller can't read it. RLS lets a
 * player read only the look a viewable play was charted against and the looks in a
 * package assigned to them, so "not found" and "not yours" look the same here.
 */
export async function loadLook(lookId: string): Promise<SavedLook | null> {
  const db = client()
  const { data: row, error } = await db
    .from('scout_looks')
    .select('id, name, side, current_version')
    .eq('id', lookId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (row?.current_version == null) return null
  const { data: version, error: versionError } = await db
    .from('scout_look_versions')
    .select('source, version')
    .eq('look_id', row.id)
    .eq('version', row.current_version)
    .maybeSingle()
  if (versionError) throw new Error(versionError.message)
  if (version == null) return null
  return {
    id: row.id,
    name: row.name,
    side: row.side,
    version: version.version,
    source: version.source as unknown as LookSource,
  }
}

/** The package tables aren't in the generated types yet; read them through this shape. */
interface LooseResult<T> {
  data: T[] | null
  error: { message: string } | null
}
interface LooseQuery<T> extends PromiseLike<LooseResult<T>> {
  in(column: string, values: readonly string[]): LooseQuery<T>
}
interface LooseClient {
  from(table: string): { select<T>(columns: string): LooseQuery<T> }
}

/**
 * Which scout packages hold each look, by package name. Staff see every package; a player
 * sees only the packages assigned to them (RLS). Empty when the tables can't be read.
 */
async function packageNames(lookIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (lookIds.length === 0) return out
  const db = client() as unknown as LooseClient
  try {
    const { data: links, error } = await db
      .from('scout_package_looks')
      .select<{ package_id: string; look_id: string }>('package_id, look_id')
      .in('look_id', lookIds)
    if (error != null || links == null || links.length === 0) return out
    const ids = [...new Set(links.map((link) => link.package_id))]
    const { data: packages, error: packageError } = await db
      .from('scout_packages')
      .select<{ id: string; name: string }>('id, name')
      .in('id', ids)
    if (packageError != null || packages == null) return out
    for (const link of links) {
      const name = packages.find((item) => item.id === link.package_id)?.name
      if (name == null) continue
      const names = out.get(link.look_id) ?? []
      if (!names.includes(name)) names.push(name)
      out.set(link.look_id, names)
    }
  } catch {
    return out
  }
  return out
}

/**
 * Every look this viewer may watch a play against: the team's scout looks on the other
 * side, as far as RLS lets the caller read them. For staff that is all of them; for a
 * player it is the play's charted look plus the looks in packages assigned to them.
 */
export async function listWatchLooks(input: {
  teamId: string
  playSide: 'offense' | 'defense'
  defaultLookId: string | null
}): Promise<LookOption[]> {
  const side = input.playSide === 'offense' ? 'defense' : 'offense'
  const looks = await listTeamLooks(input.teamId, side)
  const packages = await packageNames(looks.map((look) => look.id))
  return looks.map((look) => ({
    id: look.id,
    name: look.name,
    side,
    charted: look.id === input.defaultLookId,
    packages: packages.get(look.id) ?? [],
  }))
}
