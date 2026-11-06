import { useId, useRef, useState, type FormEvent } from 'react'
import type { PlayRow } from '../data/plays'
import { folderNameError, KIND_LABEL, type FolderKind } from './folders'
import type { PlaybookTemplate } from './playbooks'

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

export function NewFolderForm(props: {
  parentName: string | null
  initialKind: FolderKind
  onCreate: (name: string, kind: FolderKind) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FolderKind>(props.initialKind)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const kindName = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problem = folderNameError(name)
    if (problem != null) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      await props.onCreate(name.trim(), kind)
    } catch (caught) {
      setError(message(caught, 'Could not create the folder'))
      setBusy(false)
    }
  }

  return (
    <form className="folder-panel" onSubmit={(event) => void submit(event)}>
      <h2>{props.parentName == null ? 'New folder' : `New folder in ${props.parentName}`}</h2>
      <input
        className="playbook-search"
        aria-label="Folder name"
        placeholder="e.g. Lincoln High"
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className="kind-pick">
        <legend>Folder for</legend>
        {(Object.keys(KIND_LABEL) as FolderKind[]).map((option) => (
          <label key={option} className="kind-option">
            <input
              type="radio"
              name={kindName}
              value={option}
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            {option === 'playbook' ? 'Our playbook' : KIND_LABEL[option]}
          </label>
        ))}
      </fieldset>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="playbook-actions">
        <button type="submit" className="playbook-action primary" disabled={busy}>
          Create folder
        </button>
        <button type="button" className="playbook-action" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export function GeneratePlaybookPanel(props: {
  parentName: string | null
  templates: readonly PlaybookTemplate[]
  onGenerate: (templateId: string) => Promise<void>
  onCancel: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(id: string) {
    setBusy(id)
    setError(null)
    try {
      await props.onGenerate(id)
    } catch (caught) {
      setError(message(caught, 'Could not generate the playbook'))
      setBusy(null)
    }
  }

  return (
    <section className="folder-panel" aria-label="Generate playbook">
      <h2>
        {props.parentName == null
          ? 'Generate playbook'
          : `Generate playbook in ${props.parentName}`}
      </h2>
      <p className="folder-hint">
        Each one makes a folder of charted pass plays you can watch and edit.
      </p>
      <ul className="template-list">
        {props.templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className="playbook-action template-pick"
              disabled={busy != null}
              onClick={() => void pick(template.id)}
            >
              <strong>{template.name}</strong>
              <span>
                {busy === template.id
                  ? 'Creating…'
                  : `${template.plays.length} plays · ${template.summary}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="playbook-actions">
        <button type="button" className="playbook-action" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

export type AddMode = 'existing' | 'upload' | 'blank'

const MODE_LABEL: Record<AddMode, string> = {
  existing: 'Existing plays',
  upload: 'Upload play file',
  blank: 'Blank play',
}

export function AddPlaysPanel(props: {
  folderName: string | null
  candidates: PlayRow[]
  initialMode: AddMode
  onAddExisting: (playIds: string[]) => Promise<void>
  onUpload: (files: File[]) => Promise<string[]>
  onBlank: (name: string) => Promise<void>
  onClose: () => void
}) {
  const inFolder = props.folderName != null
  const modes: AddMode[] = inFolder ? ['existing', 'upload', 'blank'] : ['upload', 'blank']
  const [mode, setMode] = useState<AddMode>(
    modes.includes(props.initialMode) ? props.initialMode : (modes[0] ?? 'upload'),
  )
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const target = inFolder ? `to ${props.folderName}` : 'as unfiled plays'

  async function run(task: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (caught) {
      setError(message(caught, fallback))
    } finally {
      setBusy(false)
    }
  }

  const query = filter.trim().toLowerCase()
  const shown = props.candidates.filter((play) => play.name.toLowerCase().includes(query))

  return (
    <section className="folder-panel" aria-label={`Add plays ${target}`}>
      <h2>Add plays {target}</h2>
      <div className="roster-filters" role="group" aria-label="Add plays by">
        {modes.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => {
              setMode(option)
              setError(null)
            }}
          >
            {MODE_LABEL[option]}
          </button>
        ))}
      </div>

      {mode === 'existing' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (picked.size === 0) {
              setError('Pick at least one play')
              return
            }
            void run(() => props.onAddExisting([...picked]), 'Could not add those plays')
          }}
        >
          {props.candidates.length === 0 ? (
            <p>Every play is already in this folder.</p>
          ) : (
            <>
              <input
                className="playbook-search"
                type="search"
                aria-label="Filter plays to add"
                placeholder="Filter plays"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <ul className="pick-list">
                {shown.map((play) => (
                  <li key={play.id}>
                    <label className="pick-row">
                      <input
                        type="checkbox"
                        checked={picked.has(play.id)}
                        onChange={(event) => {
                          const next = new Set(picked)
                          if (event.target.checked) next.add(play.id)
                          else next.delete(play.id)
                          setPicked(next)
                        }}
                      />
                      <span className="playbook-name">{play.name}</span>
                      <span className="folder-meta">{play.side}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="playbook-actions">
            <button
              type="submit"
              className="playbook-action primary"
              disabled={busy || props.candidates.length === 0}
            >
              {picked.size > 1 ? `Add ${picked.size} plays` : 'Add play'}
            </button>
            <button type="button" className="playbook-action" onClick={props.onClose}>
              Done
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'upload' ? (
        <div>
          <p className="folder-hint">
            A play source (<code>.source.json</code>) or a compiled play file. Each file becomes a
            new play.
          </p>
          <input
            ref={fileInput}
            className="file-input"
            type="file"
            accept=".json,application/json"
            multiple
            aria-label="Play files"
            disabled={busy}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              if (files.length === 0) return
              void run(async () => {
                const problems = await props.onUpload(files)
                if (fileInput.current != null) fileInput.current.value = ''
                if (problems.length > 0) throw new Error(problems.join('. '))
              }, 'Upload failed')
            }}
          />
          <div className="playbook-actions">
            <button type="button" className="playbook-action" onClick={props.onClose}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'blank' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim().length === 0) {
              setError('Enter a play name')
              return
            }
            void run(async () => {
              await props.onBlank(name.trim())
              setName('')
            }, 'Could not create the play')
          }}
        >
          <p className="folder-hint">
            An offense lined up in Gun Trips Right with no routes, to fill in once the draw board is
            in.
          </p>
          <input
            className="playbook-search"
            aria-label="Play name"
            placeholder="e.g. Trips Right Mesh"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="playbook-actions">
            <button type="submit" className="playbook-action primary" disabled={busy}>
              Create play
            </button>
            <button type="button" className="playbook-action" onClick={props.onClose}>
              Done
            </button>
          </div>
        </form>
      ) : null}

      {busy ? <p className="loading-line">Saving…</p> : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
