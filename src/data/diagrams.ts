import { parseScript, type DiagramScript } from '../diagram/script'
import type { Json } from './database.types'
import { supabase } from './supabase'

/** A playbook's saved script and the save count it was read at. */
export interface RemoteScript {
  script: DiagramScript
  version: number
}

/** Someone else saved this playbook's script since it was loaded. */
export class ScriptConflictError extends Error {
  constructor() {
    super('script changed elsewhere')
    this.name = 'ScriptConflictError'
  }
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

/** The playbook's script, or null when nothing has been saved (or the row is unreadable). */
export async function loadRemoteScript(playbookId: string): Promise<RemoteScript | null> {
  const { data, error } = await client()
    .from('playbook_scripts')
    .select('script, version')
    .eq('playbook_id', playbookId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data == null) return null
  const script = parseScript(data.script)
  return script == null ? null : { script, version: data.version }
}

/**
 * Save the script. `expectedVersion` is the version it was loaded at, or null for the first
 * save. Returns the new version. Throws ScriptConflictError when another coach saved first.
 */
export async function saveRemoteScript(
  playbookId: string,
  script: DiagramScript,
  expectedVersion: number | null,
): Promise<number> {
  const db = client()
  const json = script as unknown as Json
  if (expectedVersion == null) {
    const { data, error } = await db
      .from('playbook_scripts')
      .insert({ playbook_id: playbookId, script: json })
      .select('version')
      .maybeSingle()
    // A row appeared in the meantime: someone else got there first.
    if (error?.code === '23505') throw new ScriptConflictError()
    if (error) throw new Error(error.message)
    if (data == null) throw new Error('forbidden')
    return data.version
  }
  const { data, error } = await db
    .from('playbook_scripts')
    .update({ script: json })
    .eq('playbook_id', playbookId)
    .eq('version', expectedVersion)
    .select('version')
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (row == null) throw new ScriptConflictError()
  return row.version
}
