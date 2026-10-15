export type HashRule = 'NFHS' | 'NCAA' | 'NFL'

export interface FieldConfig {
  hashRule: HashRule
  hashY: [number, number]
}

/** Yards from the right sideline (y = 0) and the left sideline. NFL is defined but unused in v1. */
export const HASH_Y: Record<HashRule, [number, number]> = {
  NFHS: [17.78, 35.56],
  NCAA: [20, 33.33],
  NFL: [23.583, 29.75],
}

export function fieldConfig(rule: HashRule = 'NFHS'): FieldConfig {
  return { hashRule: rule, hashY: HASH_Y[rule] }
}

export function hashRuleFromSearch(search: string): HashRule {
  const value = new URLSearchParams(search).get('hash')?.toLowerCase()
  if (value === 'ncaa') return 'NCAA'
  if (value === 'nfl') return 'NFL'
  return 'NFHS'
}

export function fieldConfigFromSearch(search: string): FieldConfig {
  return fieldConfig(hashRuleFromSearch(search))
}
