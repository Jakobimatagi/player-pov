import { checksumSource, compileChart } from '../editor/compileAdapter'
import type { LookSource, PlaySource } from '../play/sourceTypes'
import type { PlayFile } from '../play/types'
import type { Json } from './database.types'
import { supabase } from './supabase'

export interface PlayRow {
  id: string
  team_id: string
  name: string
  side: 'offense' | 'defense'
  current_version: number | null
  default_look_id: string | null
  updated_at: string
}

export interface PlaybookRow {
  id: string
  name: string
  playCount: number
}

const PLAY_COLUMNS = 'id, team_id, name, side, current_version, default_look_id, updated_at'

export class StaleVersionError extends Error {
  current: number

  constructor(current: number) {
    super('version conflict')
    this.name = 'StaleVersionError'
    this.current = current
  }
}

export function isVersionConflict(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? ''
  const message = error.message ?? ''
  return code === 'PT409' || code === '409' || message.toLowerCase().includes('version conflict')
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

function asSide(value: string): 'offense' | 'defense' {
  return value === 'defense' ? 'defense' : 'offense'
}

function asPlay(row: {
  id: string
  team_id: string
  name: string
  side: string
  current_version: number | null
  default_look_id: string | null
  updated_at: string
}): PlayRow {
  return {
    id: row.id,
    team_id: row.team_id,
    name: row.name,
    side: asSide(row.side),
    current_version: row.current_version,
    default_look_id: row.default_look_id,
    updated_at: row.updated_at,
  }
}

function asJson(value: unknown): Json {
  return value as Json
}

export async function listPlays(teamId: string, playbookId?: string): Promise<PlayRow[]> {
  const db = client()
  let ids: string[] | null = null
  if (playbookId != null) {
    const { data, error } = await db
      .from('playbook_plays')
      .select('play_id')
      .eq('playbook_id', playbookId)
    if (error) throw new Error(error.message)
    ids = (data ?? []).map((row) => row.play_id)
    if (ids.length === 0) return []
  }
  let query = db
    .from('plays')
    .select(PLAY_COLUMNS)
    .eq('team_id', teamId)
    .is('archived_at', null)
    .order('name')
  if (ids != null) query = query.in('id', ids)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => asPlay(row))
}

export async function listArchivedPlays(teamId: string): Promise<PlayRow[]> {
  const db = client()
  const { data, error } = await db
    .from('plays')
    .select(PLAY_COLUMNS)
    .eq('team_id', teamId)
    .not('archived_at', 'is', null)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => asPlay(row))
}

export async function loadPlay(
  playId: string,
  version?: number,
): Promise<{
  row: PlayRow
  source: PlaySource
  compiled: PlayFile
  version: number
  look: { id: string; version: number; source: LookSource } | null
}> {
  const db = client()
  const { data: row, error } = await db
    .from('plays')
    .select(PLAY_COLUMNS)
    .eq('id', playId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (row == null) throw new Error('play not found')
  const wanted = version ?? row.current_version
  if (wanted == null) throw new Error('play has no version')
  const { data: stored, error: versionError } = await db
    .from('play_versions')
    .select('source, compiled, version')
    .eq('play_id', playId)
    .eq('version', wanted)
    .maybeSingle()
  if (versionError) throw new Error(versionError.message)
  if (stored == null) throw new Error('play version not found')
  let look: { id: string; version: number; source: LookSource } | null = null
  if (row.default_look_id != null) {
    const { data: lookRow, error: lookError } = await db
      .from('scout_looks')
      .select('id, current_version')
      .eq('id', row.default_look_id)
      .maybeSingle()
    if (lookError) throw new Error(lookError.message)
    if (lookRow?.current_version != null) {
      const { data: lookVersion, error: lookVersionError } = await db
        .from('scout_look_versions')
        .select('source, version')
        .eq('look_id', lookRow.id)
        .eq('version', lookRow.current_version)
        .maybeSingle()
      if (lookVersionError) throw new Error(lookVersionError.message)
      if (lookVersion != null) {
        const source = lookVersion.source as unknown as LookSource
        look = { id: lookRow.id, version: lookVersion.version, source }
      }
    }
  }
  return {
    row: asPlay(row),
    source: stored.source as unknown as PlaySource,
    compiled: stored.compiled as unknown as PlayFile,
    version: stored.version,
    look,
  }
}

export async function savePlay(input: {
  teamId: string
  playId: string | null
  expectedVersion: number | null
  name: string
  source: PlaySource
  look: { id: string | null; expectedVersion: number | null; source: LookSource }
}): Promise<{ playId: string; version: number; lookId: string; lookVersion: number }> {
  const db = client()
  const chart = compileChart(input.source, input.look.source)
  if (chart.play == null) {
    throw new Error(chart.errors[0]?.message ?? 'play did not compile')
  }
  const [checksum, lookChecksum] = await Promise.all([
    checksumSource(input.source),
    checksumSource(input.look.source),
  ])
  const { data, error } = await db.rpc('save_play_version', {
    p_team: input.teamId,
    p_play: input.playId,
    p_expected: input.expectedVersion,
    p_name: input.name,
    p_source: asJson(input.source),
    p_compiled: asJson(chart.play),
    p_checksum: checksum,
    p_compiler: 'browser',
    p_look: input.look.id,
    p_look_expected: input.look.expectedVersion,
    p_look_source: asJson(input.look.source),
    p_look_checksum: lookChecksum,
  })
  if (error) {
    if (isVersionConflict(error)) {
      let current = input.expectedVersion ?? 0
      if (input.playId != null) {
        const { data: fresh } = await db
          .from('plays')
          .select('current_version')
          .eq('id', input.playId)
          .maybeSingle()
        if (fresh?.current_version != null) current = fresh.current_version
      }
      throw new StaleVersionError(current)
    }
    throw new Error(error.message)
  }
  const saved = data?.[0]
  if (saved == null) throw new Error('save returned no row')
  return {
    playId: saved.play_id,
    version: saved.version,
    lookId: saved.look_id,
    lookVersion: saved.look_version,
  }
}

export async function renamePlay(playId: string, name: string): Promise<void> {
  const db = client()
  const { data, error } = await db.from('plays').update({ name }).eq('id', playId).select('id')
  if (error) throw new Error(error.message)
  if (data == null || data.length === 0) throw new Error('forbidden')
}

export async function deletePlay(playId: string): Promise<void> {
  const db = client()
  const { data, error } = await db
    .from('plays')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', playId)
    .select('id')
  if (error) throw new Error(error.message)
  if (data == null || data.length === 0) throw new Error('forbidden')
}

export async function restorePlay(playId: string): Promise<void> {
  const db = client()
  const { data, error } = await db
    .from('plays')
    .update({ archived_at: null })
    .eq('id', playId)
    .select('id')
  if (error) throw new Error(error.message)
  if (data == null || data.length === 0) throw new Error('Could not restore this play')
}

export async function listPlaybooks(teamId: string): Promise<PlaybookRow[]> {
  const db = client()
  const { data, error } = await db
    .from('playbooks')
    .select('id, name')
    .eq('team_id', teamId)
    .is('archived_at', null)
    .order('name')
  if (error) throw new Error(error.message)
  const books = data ?? []
  if (books.length === 0) return []
  const { data: links, error: linkError } = await db
    .from('playbook_plays')
    .select('playbook_id')
    .in(
      'playbook_id',
      books.map((book) => book.id),
    )
  if (linkError) throw new Error(linkError.message)
  return books.map((book) => ({
    id: book.id,
    name: book.name,
    playCount: (links ?? []).filter((link) => link.playbook_id === book.id).length,
  }))
}

export async function addToPlaybook(playbookId: string, playId: string, sort = 0): Promise<void> {
  const db = client()
  const { error } = await db
    .from('playbook_plays')
    .insert({ playbook_id: playbookId, play_id: playId, sort })
  if (error) throw new Error(error.message)
}
