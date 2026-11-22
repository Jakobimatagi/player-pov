import { FIELD_WIDTH } from '../play/coords'
import type { LookSource } from '../play/sourceTypes'
import type { Position } from '../play/types'
import { LOS_Y, VIEW_YARDS } from './geometry'
import { findPreset, spotDefaults, type Preset, type PresetSide, type Spot } from './presets'
import type { Diagram, DPlayer, TokenColor } from './types'

/**
 * A team's own formations, saved from the diagram editor and used anywhere a built-in preset
 * works. A template is a Preset whose key is `tpl:<uuid>`, so it never clashes with a built-in
 * key. The database (`formation_templates`) checks the same rules as `spotsError` here.
 */

export const TEMPLATE_PREFIX = 'tpl:'
/** Every template is a full side: eleven players. */
export const TEMPLATE_SIZE = 11
export const TEMPLATE_NAME_MAX = 40
export const TEMPLATE_LABEL_MAX = 6
/** Spots stay on the field: yards downfield (dx) and sideways (dy) from the ball. */
export const TEMPLATE_DX = 20
export const TEMPLATE_DY = 27

/** The slots the built-in presets use, per side. Mirrors app.template_slots. */
export const TEMPLATE_SLOTS: Record<PresetSide, readonly string[]> = {
  offense: ['lt', 'lg', 'c', 'rg', 'rt', 'qb', 'rb', 'fb', 'x', 'z', 'y', 'h', 't', 's'],
  defense: [
    'de1',
    'dt1',
    'dt2',
    'de2',
    'nt',
    'w',
    'm',
    's',
    'n',
    'm1',
    'm2',
    'i1',
    'i2',
    'cb1',
    'cb2',
    'fs',
    'ss',
  ],
}

const TOKEN_COLORS: readonly TokenColor[] = [
  'white',
  'black',
  'red',
  'blue',
  'green',
  'orange',
  'purple',
]

export interface FormationTemplate {
  id: string
  side: PresetSide
  name: string
  spots: Spot[]
  /** Archived templates still resolve for books that use them, but leave the pickers. */
  archivedAt: string | null
}

export const templateKey = (id: string): string => `${TEMPLATE_PREFIX}${id}`

/** The template id in a `tpl:` key, or null for any other key. */
export function templateIdOf(key: string | null | undefined): string | null {
  if (key == null || !key.startsWith(TEMPLATE_PREFIX)) return null
  const id = key.slice(TEMPLATE_PREFIX.length)
  return id.length > 0 ? id : null
}

const presets = new WeakMap<FormationTemplate, Preset>()

/** A template as a Preset. The same object each time, so preview cards can memoize. */
export function templatePreset(template: FormationTemplate): Preset {
  let preset = presets.get(template)
  if (preset == null) {
    preset = {
      key: templateKey(template.id),
      name: template.name,
      side: template.side,
      spots: template.spots,
    }
    presets.set(template, preset)
  }
  return preset
}

/** Templates still offered in pickers: not archived, on one side, by name. */
export function liveTemplates(
  templates: readonly FormationTemplate[],
  side: PresetSide,
): FormationTemplate[] {
  return templates
    .filter((t) => t.side === side && t.archivedAt == null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Offense templates a playbook's base alignment can pick: the live ones, plus the one it
 * already uses even if that one was deleted (archived), so the dropdown still shows it.
 */
export function baseAlignmentTemplates(
  templates: readonly FormationTemplate[],
  current: string | null | undefined,
): FormationTemplate[] {
  const live = liveTemplates(templates, 'offense')
  const id = templateIdOf(current)
  const kept = templates.find((t) => t.id === id && t.side === 'offense' && t.archivedAt != null)
  return kept == null ? live : [...live, kept]
}

/**
 * The formation a key names: a built-in preset first, then one of the team's templates
 * (archived ones included, so a book that uses one keeps it).
 */
export function resolveFormation(
  key: string | null | undefined,
  templates: readonly FormationTemplate[] = [],
): Preset | undefined {
  const builtIn = findPreset(key)
  if (builtIn != null) return builtIn
  const id = templateIdOf(key)
  if (id == null) return undefined
  const template = templates.find((t) => t.id === id)
  return template == null ? undefined : templatePreset(template)
}

const SIDE_WORD: Record<PresetSide, string> = { offense: 'offense', defense: 'defense' }

/** Why a template name can't be used, or null. Names are unique per team and side. */
export function templateNameError(
  name: string,
  side: PresetSide,
  templates: readonly FormationTemplate[],
  exceptId?: string,
): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Name the formation.'
  if (trimmed.length > TEMPLATE_NAME_MAX) {
    return `Keep the name to ${TEMPLATE_NAME_MAX} characters.`
  }
  const taken = templates.some(
    (t) =>
      t.id !== exceptId &&
      t.side === side &&
      t.archivedAt == null &&
      t.name.toLowerCase() === trimmed.toLowerCase(),
  )
  return taken ? `You already have an ${SIDE_WORD[side]} formation named “${trimmed}”.` : null
}

/** Why these spots can't be saved, or null. Mirrors app.valid_template_spots. */
export function spotsError(side: PresetSide, spots: readonly Spot[]): string | null {
  if (spots.length !== TEMPLATE_SIZE) {
    return `A formation needs ${TEMPLATE_SIZE} ${SIDE_WORD[side]} players. This one has ${spots.length}.`
  }
  const allowed = TEMPLATE_SLOTS[side]
  const seen = new Set<string>()
  for (const spot of spots) {
    if (!allowed.includes(spot.slot)) return `“${spot.slot}” isn’t a ${SIDE_WORD[side]} slot.`
    if (seen.has(spot.slot)) return `Two players share the ${spot.slot.toUpperCase()} slot.`
    seen.add(spot.slot)
    if (!Number.isFinite(spot.dx) || !Number.isFinite(spot.dy)) return 'A player has no spot.'
    if (Math.abs(spot.dx) > TEMPLATE_DX || Math.abs(spot.dy) > TEMPLATE_DY) {
      return 'Every player must be on the field.'
    }
    if (spot.label != null && spot.label.length > TEMPLATE_LABEL_MAX) {
      return `Keep token labels to ${TEMPLATE_LABEL_MAX} characters.`
    }
    if (spot.color != null && !TOKEN_COLORS.includes(spot.color)) return 'Unknown token colour.'
  }
  return null
}

/** One side's tokens, by the same rule as applyPreset and clearSide. Text never counts. */
export function sideTokens(d: Diagram, side: PresetSide): DPlayer[] {
  return d.players.filter((p) =>
    side === 'defense' ? p.side === 'defense' : p.side !== 'defense' && p.shape !== 'text',
  )
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** A token's spot in yards from the ball, the inverse of presetPlayers. */
function yards(p: DPlayer): { dx: number; dy: number } {
  return { dx: round1((LOS_Y - p.y) * VIEW_YARDS), dy: round1((0.5 - p.x) * FIELD_WIDTH) }
}

const LINE_SLOTS = ['lt', 'lg', 'c', 'rg', 'rt']

/** Token labels that name a slot. */
const LABEL_SLOTS: Record<PresetSide, Record<string, readonly string[]>> = {
  offense: { F: ['fb'], FB: ['fb'], QB: ['qb'], RB: ['rb'] },
  defense: {
    DE: ['de1', 'de2'],
    DT: ['dt1', 'dt2'],
    NT: ['nt'],
    M: ['m', 'm1', 'm2'],
    I: ['i1', 'i2'],
    CB: ['cb1', 'cb2'],
  },
}

/**
 * A slot for every token, so a formation a coach placed by hand can still be saved. A token
 * keeps the slot a preset gave it; next its label picks one (`X`, `F`, `DE`); the rest go by
 * where they stand: linemen on the ball, the QB behind the center, backs, then receivers
 * from the widest in. Defenders go by depth: line, linebackers, corners, safeties.
 */
export function assignSlots(tokens: readonly DPlayer[], side: PresetSide): string[] {
  const pool = TEMPLATE_SLOTS[side]
  const out: (string | null)[] = tokens.map(() => null)
  const taken = new Set<string>()
  const at = tokens.map(yards)
  const give = (i: number, slot: string) => {
    out[i] = slot
    taken.add(slot)
  }
  const free = (slots: readonly string[]) => slots.filter((s) => !taken.has(s))
  const open = () => tokens.map((_, i) => i).filter((i) => out[i] == null)
  // Left to right from the offense's view: +dy first.
  const leftFirst = (ids: number[]) => ids.slice().sort((a, b) => at[b]!.dy - at[a]!.dy)

  tokens.forEach((p, i) => {
    if (p.slot != null && pool.includes(p.slot) && !taken.has(p.slot)) give(i, p.slot)
  })
  for (const i of leftFirst(open())) {
    const label = (tokens[i]!.label ?? '').trim()
    const named = LABEL_SLOTS[side][label.toUpperCase()] ?? [label.toLowerCase()]
    const slot = free(named.filter((s) => pool.includes(s)))[0]
    if (slot != null) give(i, slot)
  }

  const fill = (ids: number[], slots: readonly string[]) => {
    const left = free(slots)
    ids.forEach((i, n) => {
      const slot = left[n]
      if (slot != null) give(i, slot)
    })
  }

  if (side === 'offense') {
    const lineSlots = free(LINE_SLOTS)
    const onBall = open()
      .filter((i) => at[i]!.dx > -1.5 && Math.abs(at[i]!.dy) <= 6)
      .sort((a, b) => Math.abs(at[a]!.dy) - Math.abs(at[b]!.dy))
      .slice(0, lineSlots.length)
    fill(leftFirst(onBall), lineSlots)
    if (!taken.has('qb')) {
      const qb = open()
        .filter((i) => Math.abs(at[i]!.dy) < 1.5 && at[i]!.dx < -0.5)
        .sort((a, b) => at[b]!.dx - at[a]!.dx)[0]
      if (qb != null) give(qb, 'qb')
    }
    const backs = open()
      .filter((i) => at[i]!.dx < -2.5 && Math.abs(at[i]!.dy) <= 4.5)
      .sort((a, b) => at[b]!.dx - at[a]!.dx)
    fill(backs, backs.length >= 2 ? ['fb', 'rb'] : ['rb', 'fb'])
    const wideFirst = open().sort((a, b) => Math.abs(at[b]!.dy) - Math.abs(at[a]!.dy))
    for (const i of wideFirst) {
      const order = at[i]!.dy > 0 ? ['x', 'h', 's', 't', 'y', 'z'] : ['z', 'y', 'h', 's', 't', 'x']
      const slot = free(order)[0]
      if (slot != null) give(i, slot)
    }
  } else {
    const line = leftFirst(open().filter((i) => at[i]!.dx < 3))
    fill(
      line,
      line.length === 4
        ? ['de1', 'dt1', 'dt2', 'de2']
        : line.length === 3
          ? ['de1', 'nt', 'de2']
          : ['de1', 'dt1', 'nt', 'dt2', 'de2'],
    )
    const backers = leftFirst(open().filter((i) => at[i]!.dx < 7 && Math.abs(at[i]!.dy) < 12))
    fill(
      backers,
      backers.length === 2
        ? ['w', 'm']
        : backers.length === 3
          ? ['w', 'm', 's']
          : backers.length === 4
            ? ['w', 'm1', 'm2', 's']
            : ['w', 'm', 's', 'n', 'm1', 'm2', 'i1', 'i2'],
    )
    fill(leftFirst(open().filter((i) => Math.abs(at[i]!.dy) >= 12)), ['cb1', 'cb2'])
    fill(leftFirst(open()), ['fs', 'ss'])
  }
  // Anyone still without one takes the next free slot.
  for (const i of open()) {
    const slot = free(pool)[0]
    if (slot != null) give(i, slot)
  }
  return out.map((slot) => slot ?? '')
}

/**
 * One side of a diagram as template spots. Keeps each token's spot, and its label and colour
 * where they differ from what the slot would give, so applying it puts back what was saved.
 */
export function spotsFromDiagram(
  d: Diagram,
  side: PresetSide,
): { spots: Spot[] } | { error: string } {
  const tokens = sideTokens(d, side)
  if (tokens.length !== TEMPLATE_SIZE) {
    return {
      error: `A formation needs ${TEMPLATE_SIZE} ${SIDE_WORD[side]} players. The field has ${tokens.length}.`,
    }
  }
  const slots = assignSlots(tokens, side)
  const spots = tokens.map((p, i): Spot => {
    const slot = slots[i]!
    const fallback = spotDefaults(side, slot)
    const label = p.label ?? ''
    return {
      slot,
      ...yards(p),
      ...(label !== (fallback.label ?? '') ? { label: label.slice(0, TEMPLATE_LABEL_MAX) } : {}),
      ...(p.color !== fallback.color ? { color: p.color } : {}),
    }
  })
  const error = spotsError(side, spots)
  return error != null ? { error } : { spots }
}

/** "Gun Spread (copy)", then "(copy 2)" and so on, kept to the name limit. */
export function copyName(
  name: string,
  side: PresetSide,
  templates: readonly FormationTemplate[],
): string {
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`
    const candidate = `${name.slice(0, TEMPLATE_NAME_MAX - suffix.length).trim()}${suffix}`
    if (templateNameError(candidate, side, templates) == null) return candidate
  }
}

const POSITION: Record<string, Position> = {
  lt: 'LT',
  lg: 'LG',
  c: 'C',
  rg: 'RG',
  rt: 'RT',
  qb: 'QB',
  rb: 'RB',
  fb: 'FB',
  x: 'WR',
  z: 'WR',
  h: 'WR',
  s: 'WR',
  y: 'TE',
  t: 'TE',
}

const JERSEY: Record<string, number> = {
  lt: 76,
  lg: 66,
  c: 64,
  rg: 68,
  rt: 72,
  qb: 12,
  rb: 28,
  fb: 44,
  x: 1,
  z: 4,
  h: 11,
  s: 3,
  y: 88,
  t: 85,
}

/**
 * An offense template as a look a defense plans against on the Facing strip, tagged by
 * detectTags like any other look. Null for a defense template.
 */
export function templateLook(template: FormationTemplate): LookSource | null {
  if (template.side !== 'offense') return null
  return {
    id: templateKey(template.id),
    name: template.name,
    side: 'offense',
    players: template.spots.map((spot) => ({
      slot: spot.slot,
      position: POSITION[spot.slot] ?? 'WR',
      jersey: JERSEY[spot.slot] ?? 0,
      face: 0,
      align: { dx: spot.dx, dy: spot.dy },
      legs: [],
    })),
  }
}
