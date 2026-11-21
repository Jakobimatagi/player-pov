import type { Side } from './database.types'
import { supabase } from './supabase'

/** What one player in a play does. Every field is optional free text. */
export interface RuleFields {
  alignment: string
  assignment: string
  keyRead: string
  notes: string
}

export interface PositionRule extends RuleFields {
  slot: string
  side: Side
  updatedAt: string
}

export const RULE_FIELDS: readonly {
  key: keyof RuleFields
  label: string
  max: number
  hint: string
}[] = [
  { key: 'alignment', label: 'Alignment', max: 280, hint: 'e.g. 12 yds, split the hashes' },
  { key: 'assignment', label: 'Assignment', max: 500, hint: 'e.g. Deep half, nothing behind you' },
  { key: 'keyRead', label: 'Key / read', max: 280, hint: 'e.g. #2 receiver vertical' },
  { key: 'notes', label: 'Coaching points', max: 1000, hint: 'Anything else for this player' },
]

export const EMPTY_RULE: RuleFields = { alignment: '', assignment: '', keyRead: '', notes: '' }

export function isEmptyRule(rule: RuleFields): boolean {
  return RULE_FIELDS.every((field) => rule[field.key].trim() === '')
}

/** Trimmed fields, with blanks stored as null. */
export function ruleColumns(rule: RuleFields): {
  alignment: string | null
  assignment: string | null
  key_read: string | null
  notes: string | null
} {
  const clean = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    alignment: clean(rule.alignment),
    assignment: clean(rule.assignment),
    key_read: clean(rule.keyRead),
    notes: clean(rule.notes),
  }
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

export async function listRules(playId: string): Promise<PositionRule[]> {
  const { data, error } = await client()
    .from('position_rules')
    .select('slot, side, alignment, assignment, key_read, notes, updated_at')
    .eq('play_id', playId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    slot: row.slot,
    side: row.side === 'defense' ? 'defense' : 'offense',
    alignment: row.alignment ?? '',
    assignment: row.assignment ?? '',
    keyRead: row.key_read ?? '',
    notes: row.notes ?? '',
    updatedAt: row.updated_at,
  }))
}

/**
 * Saves one slot's rule; an all-blank rule deletes it. Update first, then insert: the
 * table grants UPDATE on the text columns only, which an upsert would exceed. The
 * database stamps team and side from the play and refuses a side the caller doesn't own.
 */
export async function saveRule(input: {
  teamId: string
  playId: string
  slot: string
  side: Side
  rule: RuleFields
}): Promise<'saved' | 'deleted'> {
  const db = client()
  if (isEmptyRule(input.rule)) {
    const { error } = await db
      .from('position_rules')
      .delete()
      .eq('play_id', input.playId)
      .eq('slot', input.slot)
    if (error) throw new Error(error.message)
    return 'deleted'
  }
  const columns = ruleColumns(input.rule)
  const { data, error } = await db
    .from('position_rules')
    .update(columns)
    .eq('play_id', input.playId)
    .eq('slot', input.slot)
    .select('slot')
  if (error) throw new Error(error.message)
  if (data != null && data.length > 0) return 'saved'
  const { error: insertError } = await db.from('position_rules').insert({
    play_id: input.playId,
    slot: input.slot,
    team_id: input.teamId,
    side: input.side,
    ...columns,
  })
  if (insertError) {
    if (insertError.code === '42501' || insertError.code === '23505') {
      throw new Error(`Only the head coach or the ${input.side} coordinator can edit this player.`)
    }
    throw new Error(insertError.message)
  }
  return 'saved'
}
