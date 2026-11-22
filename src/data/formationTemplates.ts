import { z } from 'zod'
import type { PresetSide, Spot } from '../diagram/presets'
import type { FormationTemplate } from '../diagram/templates'
import type { Json } from './database.types'
import { supabase } from './supabase'

/**
 * The team's saved formations (`formation_templates`). Staff read them all; writes follow the
 * side rules (an OC saves offense, a DC defense). Deleting archives, so a playbook whose base
 * alignment is a template keeps resolving it.
 */

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

const SpotSchema = z.object({
  slot: z.string(),
  dx: z.number(),
  dy: z.number(),
  label: z.string().optional(),
  color: z.enum(['white', 'black', 'red', 'blue', 'green', 'orange', 'purple']).optional(),
})

const COLUMNS = 'id, side, name, spots, archived_at'

interface Row {
  id: string
  side: PresetSide
  name: string
  spots: Json
  archived_at: string | null
}

/** A row as a template, or null when its spots don't parse. */
export function templateFromRow(row: Row): FormationTemplate | null {
  const spots = z.array(SpotSchema).safeParse(row.spots)
  if (!spots.success) return null
  return {
    id: row.id,
    side: row.side,
    name: row.name,
    spots: spots.data as Spot[],
    archivedAt: row.archived_at,
  }
}

/** A database error in words a coach can act on. */
export function templateErrorText(
  error: { code?: string; message: string },
  side: PresetSide,
  name?: string,
): string {
  if (error.code === '23505') {
    return `You already have an ${side} formation named “${name ?? ''}”.`
  }
  if (error.code === '42501') return `You can’t save ${side} formations.`
  if (error.code === '23514')
    return 'That formation can’t be saved: it needs 11 players on the field.'
  return error.message
}

/** Every template on the team, archived ones included (books may still point at them). */
export async function listFormationTemplates(teamId: string): Promise<FormationTemplate[]> {
  const { data, error } = await client()
    .from('formation_templates')
    .select(COLUMNS)
    .eq('team_id', teamId)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap((row) => templateFromRow(row) ?? [])
}

/** One template by id, archived or not. Null when it isn't there or can't be read. */
export async function getFormationTemplate(id: string): Promise<FormationTemplate | null> {
  const { data, error } = await client()
    .from('formation_templates')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data == null ? null : templateFromRow(data)
}

export async function createFormationTemplate(input: {
  teamId: string
  side: PresetSide
  name: string
  spots: readonly Spot[]
}): Promise<FormationTemplate> {
  const name = input.name.trim()
  const { data, error } = await client()
    .from('formation_templates')
    .insert({
      team_id: input.teamId,
      side: input.side,
      name,
      spots: input.spots as unknown as Json,
    })
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw new Error(templateErrorText(error, input.side, name))
  const template = data == null ? null : templateFromRow(data)
  if (template == null) throw new Error(`You can’t save ${input.side} formations.`)
  return template
}

/** Rename a template or replace its spots. */
export async function updateFormationTemplate(
  template: FormationTemplate,
  change: { name?: string; spots?: readonly Spot[] },
): Promise<FormationTemplate> {
  const name = change.name?.trim()
  const { data, error } = await client()
    .from('formation_templates')
    .update({
      ...(name != null ? { name } : {}),
      ...(change.spots != null ? { spots: change.spots as unknown as Json } : {}),
    })
    .eq('id', template.id)
    .select(COLUMNS)
  if (error) throw new Error(templateErrorText(error, template.side, name))
  const row = data?.[0]
  const next = row == null ? null : templateFromRow(row)
  if (next == null) throw new Error(`You can’t change ${template.side} formations.`)
  return next
}

/** Take a template out of the pickers. Books that use it keep it. */
export async function archiveFormationTemplate(
  template: FormationTemplate,
): Promise<FormationTemplate> {
  const { data, error } = await client()
    .from('formation_templates')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', template.id)
    .select(COLUMNS)
  if (error) throw new Error(templateErrorText(error, template.side))
  const row = data?.[0]
  const next = row == null ? null : templateFromRow(row)
  if (next == null) throw new Error(`You can’t delete ${template.side} formations.`)
  return next
}
