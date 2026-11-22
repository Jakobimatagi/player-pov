import type { Side } from './database.types'
import { supabase } from './supabase'

/**
 * What one player in a play does: the 3 A's before the snap, the 3 R's after it, and
 * optional coaching points. Every position on the play's own side owes all six A's and
 * R's before the play can be published (`publish_play` in the database).
 */
export interface RuleFields {
  alignment: string
  assignment: string
  adjustment: string
  keyRead: string
  recognize: string
  react: string
  notes: string
}

export interface PositionRule extends RuleFields {
  slot: string
  side: Side
  updatedAt: string
}

export type RulePhase = 'pre' | 'post' | 'extra'

export interface RuleFieldDef {
  key: keyof RuleFields
  label: string
  /** The question the answer has to settle, shown to coaches and players. */
  question: string
  phase: RulePhase
  required: boolean
  max: number
  hint: string
}

export const RULE_FIELDS: readonly RuleFieldDef[] = [
  {
    key: 'alignment',
    label: 'Alignment',
    question: 'Where do I line up?',
    phase: 'pre',
    required: true,
    max: 280,
    hint: 'e.g. 12 yds deep, split the hash and the numbers',
  },
  {
    key: 'assignment',
    label: 'Assignment',
    question: 'What is my job on the snap?',
    phase: 'pre',
    required: true,
    max: 500,
    hint: 'e.g. Deep half, nothing gets behind you',
  },
  {
    key: 'adjustment',
    label: 'Adjustment',
    question: 'What changes vs motion, shifts or other formations?',
    phase: 'pre',
    required: true,
    max: 500,
    hint: 'e.g. vs Trips, rotate to the middle of the field',
  },
  {
    key: 'keyRead',
    label: 'Read',
    question: 'What do I look at after the snap?',
    phase: 'post',
    required: true,
    max: 280,
    hint: 'e.g. #2 receiver to the QB',
  },
  {
    key: 'recognize',
    label: 'Recognize',
    question: 'What does it tell me?',
    phase: 'post',
    required: true,
    max: 280,
    hint: 'e.g. #2 vertical = seam is coming; #2 out = flood',
  },
  {
    key: 'react',
    label: 'React',
    question: 'What do I do about it?',
    phase: 'post',
    required: true,
    max: 500,
    hint: 'e.g. Carry #2 vertical, break on the throw',
  },
  {
    key: 'notes',
    label: 'Coaching points',
    question: 'Anything else?',
    phase: 'extra',
    required: false,
    max: 1000,
    hint: 'Optional',
  },
]

export const REQUIRED_FIELDS = RULE_FIELDS.filter((field) => field.required)

export const PHASE_LABEL: Record<RulePhase, string> = {
  pre: 'Pre-snap',
  post: 'Post-snap',
  extra: 'Notes',
}

export const EMPTY_RULE: RuleFields = {
  alignment: '',
  assignment: '',
  adjustment: '',
  keyRead: '',
  recognize: '',
  react: '',
  notes: '',
}

export function isEmptyRule(rule: RuleFields): boolean {
  return RULE_FIELDS.every((field) => rule[field.key].trim() === '')
}

/** Required answers this rule is still missing. A missing rule misses all six. */
export function missingFields(rule: RuleFields | null | undefined): RuleFieldDef[] {
  return REQUIRED_FIELDS.filter((field) => rule == null || rule[field.key].trim() === '')
}

export function isCompleteRule(rule: RuleFields | null | undefined): boolean {
  return missingFields(rule).length === 0
}

/**
 * How far along a play is: the slots on its own side, which of them have all six
 * answers, and which don't. Mirrors `app.play_rule_gaps` in the database.
 */
export function playCompletion(
  slots: readonly string[],
  rules: readonly Pick<PositionRule, 'slot' | keyof RuleFields>[],
): { total: number; complete: string[]; incomplete: string[] } {
  const bySlot = new Map(rules.map((rule) => [rule.slot, rule]))
  const complete: string[] = []
  const incomplete: string[] = []
  for (const slot of slots) {
    if (isCompleteRule(bySlot.get(slot))) complete.push(slot)
    else incomplete.push(slot)
  }
  return { total: slots.length, complete, incomplete }
}

/** Trimmed fields, with blanks stored as null. */
export function ruleColumns(rule: RuleFields): {
  alignment: string | null
  assignment: string | null
  adjustment: string | null
  key_read: string | null
  recognize: string | null
  react: string | null
  notes: string | null
} {
  const clean = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    alignment: clean(rule.alignment),
    assignment: clean(rule.assignment),
    adjustment: clean(rule.adjustment),
    key_read: clean(rule.keyRead),
    recognize: clean(rule.recognize),
    react: clean(rule.react),
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
    .select(
      'slot, side, alignment, assignment, adjustment, key_read, recognize, react, notes, updated_at',
    )
    .eq('play_id', playId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    slot: row.slot,
    side: row.side === 'defense' ? 'defense' : 'offense',
    alignment: row.alignment ?? '',
    assignment: row.assignment ?? '',
    adjustment: row.adjustment ?? '',
    keyRead: row.key_read ?? '',
    recognize: row.recognize ?? '',
    react: row.react ?? '',
    notes: row.notes ?? '',
    updatedAt: row.updated_at,
  }))
}

/** Turns a database refusal into words a coach can act on. */
export function ruleSaveError(error: { code?: string; message: string }, side: Side): Error {
  if (error.code === '42501' || error.code === '23505') {
    return new Error(`Only the head coach or the ${side} coordinator can edit this player.`)
  }
  if (error.code === '23514' && error.message.includes('published')) {
    return new Error(
      'This play is published, so every answer has to stay filled in. Unpublish it to clear one.',
    )
  }
  return new Error(error.message)
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
    if (error) throw ruleSaveError(error, input.side)
    return 'deleted'
  }
  const columns = ruleColumns(input.rule)
  const { data, error } = await db
    .from('position_rules')
    .update(columns)
    .eq('play_id', input.playId)
    .eq('slot', input.slot)
    .select('slot')
  if (error) throw ruleSaveError(error, input.side)
  if (data != null && data.length > 0) return 'saved'
  const { error: insertError } = await db.from('position_rules').insert({
    play_id: input.playId,
    slot: input.slot,
    team_id: input.teamId,
    side: input.side,
    ...columns,
  })
  if (insertError) throw ruleSaveError(insertError, input.side)
  return 'saved'
}
