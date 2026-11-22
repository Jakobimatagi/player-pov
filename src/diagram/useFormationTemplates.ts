import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PresetSide, Spot } from './presets'
import {
  DEMO_TEMPLATES,
  remoteBackend,
  upsertTemplate,
  type TemplateBackend,
} from './templateStore'
import type { FormationTemplate } from './templates'

export interface TemplatesState {
  /** Every template on the team, archived ones included. */
  templates: FormationTemplate[]
  /** False until the first list has come back. */
  loaded: boolean
  /** Why the list could not be read, when it couldn't. */
  error: string | null
  /** False when there is nowhere to save (signed out, no team). */
  available: boolean
  save(side: PresetSide, name: string, spots: readonly Spot[]): Promise<FormationTemplate>
  update(
    template: FormationTemplate,
    change: { name?: string; spots?: readonly Spot[] },
  ): Promise<FormationTemplate>
  archive(template: FormationTemplate): Promise<FormationTemplate>
}

/** The team's saved formations, from the database or, in the demo, from memory. */
export function useFormationTemplates(teamId: string | null, demo: boolean): TemplatesState {
  const backend = useMemo<TemplateBackend | null>(
    () => (demo ? DEMO_TEMPLATES : teamId != null ? remoteBackend(teamId) : null),
    [demo, teamId],
  )
  const [found, setFound] = useState<{
    backend: TemplateBackend
    templates: FormationTemplate[]
    error: string | null
  } | null>(null)
  // A list only counts for the backend it was read from.
  const current = found != null && found.backend === backend ? found : null

  useEffect(() => {
    if (backend == null) return
    let dead = false
    backend.list().then(
      (templates) => {
        if (!dead) setFound({ backend, templates, error: null })
      },
      (error: unknown) => {
        if (!dead) {
          setFound({
            backend,
            templates: [],
            error: error instanceof Error ? error.message : 'Could not load your formations',
          })
        }
      },
    )
    return () => {
      dead = true
    }
  }, [backend])

  const put = useCallback(
    (next: FormationTemplate) => {
      if (backend == null) return
      setFound((prev) => ({
        backend,
        templates: upsertTemplate(
          prev != null && prev.backend === backend ? prev.templates : [],
          next,
        ),
        error: null,
      }))
    },
    [backend],
  )

  const need = useCallback(() => {
    if (backend == null) throw new Error('Sign in to a team to save formations.')
    return backend
  }, [backend])

  return {
    templates: current?.templates ?? [],
    loaded: backend == null || current != null,
    error: current?.error ?? null,
    available: backend != null,
    save: async (side, name, spots) => {
      const saved = await need().create({ side, name, spots })
      put(saved)
      return saved
    },
    update: async (template, change) => {
      const saved = await need().update(template, change)
      put(saved)
      return saved
    },
    archive: async (template) => {
      const saved = await need().archive(template)
      put(saved)
      return saved
    },
  }
}
