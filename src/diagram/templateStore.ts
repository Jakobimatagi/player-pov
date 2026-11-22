import {
  archiveFormationTemplate,
  createFormationTemplate,
  listFormationTemplates,
  updateFormationTemplate,
} from '../data/formationTemplates'
import type { PresetSide, Spot } from './presets'
import { spotsError, templateNameError, type FormationTemplate } from './templates'

/** Where a team's templates live: the database, or memory in the demo and in tests. */
export interface TemplateBackend {
  list(): Promise<FormationTemplate[]>
  create(input: {
    side: PresetSide
    name: string
    spots: readonly Spot[]
  }): Promise<FormationTemplate>
  update(
    template: FormationTemplate,
    change: { name?: string; spots?: readonly Spot[] },
  ): Promise<FormationTemplate>
  archive(template: FormationTemplate): Promise<FormationTemplate>
}

export function remoteBackend(teamId: string): TemplateBackend {
  return {
    list: () => listFormationTemplates(teamId),
    create: (input) => createFormationTemplate({ teamId, ...input }),
    update: updateFormationTemplate,
    archive: archiveFormationTemplate,
  }
}

let counter = 0
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

/**
 * Templates kept in memory, checked by the same rules as the database: a unique live name per
 * side, eleven spots on known slots. Archiving keeps the template so books still resolve it.
 * `keep` is told the rows after every change, so the demo can hold them for the visit.
 */
export function memoryBackend(
  seed: readonly FormationTemplate[] = [],
  keep?: (rows: readonly FormationTemplate[]) => void,
): TemplateBackend {
  let rows: FormationTemplate[] = seed.slice()
  const commit = (next: FormationTemplate[]) => {
    rows = next
    keep?.(next)
  }
  const check = (side: PresetSide, name: string, spots: readonly Spot[], exceptId?: string) => {
    const problem = templateNameError(name, side, rows, exceptId) ?? spotsError(side, spots)
    if (problem != null) throw new Error(problem)
  }
  const replace = (next: FormationTemplate) => {
    commit(rows.map((row) => (row.id === next.id ? next : row)))
    return next
  }
  const find = (id: string) => {
    const current = rows.find((row) => row.id === id)
    if (current == null) throw new Error('That formation is gone.')
    return current
  }
  return {
    list: async () => rows.slice(),
    create: async ({ side, name, spots }) => {
      check(side, name, spots)
      const template: FormationTemplate = {
        id: newId(),
        side,
        name: name.trim(),
        spots: spots.slice(),
        archivedAt: null,
      }
      commit([...rows, template])
      return template
    },
    update: async (template, change) => {
      const current = find(template.id)
      const name = change.name?.trim() ?? current.name
      const spots = change.spots?.slice() ?? current.spots
      check(current.side, name, spots, current.id)
      return replace({ ...current, name, spots })
    },
    archive: async (template) =>
      replace({ ...find(template.id), archivedAt: new Date().toISOString() }),
  }
}

const DEMO_KEY = 'pov.demo.formationTemplates'

function demoSeed(): FormationTemplate[] {
  try {
    const raw = sessionStorage.getItem(DEMO_KEY)
    const rows: unknown = raw == null ? [] : JSON.parse(raw)
    return Array.isArray(rows) ? (rows as FormationTemplate[]) : []
  } catch {
    return []
  }
}

/**
 * The demo's templates: one list for the visit (this tab's session storage), so the playbook
 * page and the Facing strip see what the editor saved.
 */
export const DEMO_TEMPLATES: TemplateBackend = memoryBackend(demoSeed(), (rows) => {
  try {
    sessionStorage.setItem(DEMO_KEY, JSON.stringify(rows))
  } catch {
    // Storage blocked: the list still lasts until the page reloads.
  }
})

/** The list after one template was added or changed. */
export function upsertTemplate(
  list: readonly FormationTemplate[],
  next: FormationTemplate,
): FormationTemplate[] {
  return list.some((row) => row.id === next.id)
    ? list.map((row) => (row.id === next.id ? next : row))
    : [...list, next]
}
