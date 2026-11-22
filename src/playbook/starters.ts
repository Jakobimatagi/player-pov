import { buildDefenseBook, DEFENSE_TEMPLATES } from './defenseTemplates'
import type { NewPlay } from './newPlays'
import { buildPlaybook, PLAYBOOK_TEMPLATES } from './playbooks'

/** A starter playbook either side can generate: offense concepts or defensive calls. */
export interface Starter {
  id: string
  name: string
  summary: string
  side: 'offense' | 'defense'
  playCount: number
  build: () => NewPlay[]
}

export const STARTERS: readonly Starter[] = [
  ...PLAYBOOK_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    summary: template.summary,
    side: 'offense' as const,
    playCount: template.plays.length,
    build: () => buildPlaybook(template.id),
  })),
  ...DEFENSE_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    summary: template.summary,
    side: 'defense' as const,
    playCount: template.plays.length,
    build: () => buildDefenseBook(template.id),
  })),
]

export function findStarter(id: string): Starter | undefined {
  return STARTERS.find((starter) => starter.id === id)
}
