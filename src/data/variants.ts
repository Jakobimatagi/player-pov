import {
  PERSONNEL_LABEL,
  STRUCTURE_LABEL,
  type FormationTags,
  type Structure,
} from '../formations/library'
import type { Side } from './database.types'
import { EMPTY_RULE, RULE_FIELDS, type RuleFields } from './rules'
import { supabase } from './supabase'

/**
 * "vs" exceptions: a position's answers that change against one formation, one receiver
 * structure, or one personnel group. Blank answers inherit, so an exception only lists
 * what changes. Mirrors `position_rule_variants` in the database.
 */

export type VariantScope = 'look' | 'structure' | 'personnel'

/** Most specific first. */
export const SCOPE_ORDER: readonly VariantScope[] = ['look', 'structure', 'personnel']

export interface RuleVariant extends RuleFields {
  slot: string
  scope: VariantScope
  match: string
  side: Side
}

/** What the board is facing: a formation's id, name and tags. */
export interface Facing {
  id: string
  name: string
  tags: FormationTags
}

export interface VariantTarget {
  scope: VariantScope
  match: string
}

/** The three exception levels that apply to one formation, most specific first. */
export function targetsFor(facing: Facing): VariantTarget[] {
  return [
    { scope: 'look', match: facing.id },
    { scope: 'structure', match: facing.tags.structure },
    { scope: 'personnel', match: facing.tags.personnel },
  ]
}

/** "vs Gun Trips Right", "vs 3x1 (trips)", "vs 12 personnel" */
export function targetLabel(target: VariantTarget, facing?: Facing): string {
  if (target.scope === 'look')
    return `vs ${facing?.id === target.match ? facing.name : 'this formation'}`
  if (target.scope === 'structure') {
    return `vs ${STRUCTURE_LABEL[target.match as Structure] ?? target.match}`
  }
  return `vs ${PERSONNEL_LABEL(target.match)}`
}

/** Short tag shown next to an overridden answer: "this formation", "3x1", "12 pers". */
export function targetTag(target: VariantTarget): string {
  if (target.scope === 'look') return 'this formation'
  if (target.scope === 'structure') return target.match
  return `${target.match} pers`
}

export interface ResolvedRule {
  fields: RuleFields
  /** Which exception supplied each answer; absent = the base rule. */
  from: Partial<Record<keyof RuleFields, VariantTarget>>
}

/**
 * One position's answers against a formation. Per answer, the most specific exception
 * with something in it wins: this formation, then its structure, then its personnel,
 * then the base rule.
 */
export function resolveRule(
  base: RuleFields | null | undefined,
  variants: readonly RuleVariant[],
  slot: string,
  facing: Facing | null,
): ResolvedRule {
  const fields: RuleFields = { ...EMPTY_RULE }
  for (const field of RULE_FIELDS) fields[field.key] = base?.[field.key] ?? ''
  const from: ResolvedRule['from'] = {}
  if (facing == null) return { fields, from }
  const layers = targetsFor(facing)
    .map((target) => ({
      target,
      variant: variants.find(
        (item) => item.slot === slot && item.scope === target.scope && item.match === target.match,
      ),
    }))
    .filter((layer) => layer.variant != null)
  for (const field of RULE_FIELDS) {
    const hit = layers.find((layer) => (layer.variant?.[field.key] ?? '').trim() !== '')
    if (hit?.variant != null) {
      fields[field.key] = hit.variant[field.key]
      from[field.key] = hit.target
    }
  }
  return { fields, from }
}

/** How many of a slot's exceptions apply to this formation. */
export function variantCount(
  variants: readonly RuleVariant[],
  slot: string,
  facing: Facing | null,
): number {
  if (facing == null) return 0
  return targetsFor(facing).filter((target) =>
    variants.some(
      (item) => item.slot === slot && item.scope === target.scope && item.match === target.match,
    ),
  ).length
}

function client() {
  if (supabase == null) throw new Error('supabase is not configured')
  return supabase
}

function columns(fields: RuleFields) {
  const clean = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    alignment: clean(fields.alignment),
    assignment: clean(fields.assignment),
    adjustment: clean(fields.adjustment),
    key_read: clean(fields.keyRead),
    recognize: clean(fields.recognize),
    react: clean(fields.react),
    notes: clean(fields.notes),
  }
}

export async function listVariants(playId: string): Promise<RuleVariant[]> {
  const { data, error } = await client()
    .from('position_rule_variants')
    .select(
      'slot, scope, match, side, alignment, assignment, adjustment, key_read, recognize, react, notes',
    )
    .eq('play_id', playId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    slot: row.slot,
    scope: row.scope as VariantScope,
    match: row.match,
    side: row.side === 'defense' ? 'defense' : 'offense',
    alignment: row.alignment ?? '',
    assignment: row.assignment ?? '',
    adjustment: row.adjustment ?? '',
    keyRead: row.key_read ?? '',
    recognize: row.recognize ?? '',
    react: row.react ?? '',
    notes: row.notes ?? '',
  }))
}

/** Saves an exception; one with every answer blank is deleted (it would just be the base). */
export async function saveVariant(input: {
  teamId: string
  playId: string
  slot: string
  side: Side
  target: VariantTarget
  fields: RuleFields
}): Promise<'saved' | 'deleted'> {
  const db = client()
  const cols = columns(input.fields)
  const denied = (code: string | undefined, message: string) =>
    code === '42501'
      ? new Error(`Only the head coach or the ${input.side} coordinator can edit this player.`)
      : new Error(message)
  if (Object.values(cols).every((value) => value == null)) {
    const { error } = await db
      .from('position_rule_variants')
      .delete()
      .eq('play_id', input.playId)
      .eq('slot', input.slot)
      .eq('scope', input.target.scope)
      .eq('match', input.target.match)
    if (error) throw denied(error.code, error.message)
    return 'deleted'
  }
  const { data, error } = await db
    .from('position_rule_variants')
    .update(cols)
    .eq('play_id', input.playId)
    .eq('slot', input.slot)
    .eq('scope', input.target.scope)
    .eq('match', input.target.match)
    .select('slot')
  if (error) throw denied(error.code, error.message)
  if (data != null && data.length > 0) return 'saved'
  const { error: insertError } = await db.from('position_rule_variants').insert({
    play_id: input.playId,
    slot: input.slot,
    scope: input.target.scope,
    match: input.target.match,
    team_id: input.teamId,
    side: input.side,
    ...cols,
  })
  if (insertError) throw denied(insertError.code, insertError.message)
  return 'saved'
}
