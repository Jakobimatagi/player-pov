import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { AccountMenu } from '../app/AccountMenu'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import type { PlayRow } from '../data/plays'
import {
  archiveFolder,
  createFolder,
  createPlay,
  deletePlay,
  fileInFolder,
  listArchivedPlays,
  listFolders,
  listPlays,
  removeFromFolder,
  renameFolder,
  renamePlay,
  restorePlay,
} from '../data/plays'
import { supabase } from '../data/supabase'
import {
  afterRestore,
  DEMO_ARCHIVED,
  DEMO_FOLDERS,
  DEMO_LINKS,
  DEMO_PLAYS,
  honorDemoRoster,
  listStatus,
  visiblePlays,
} from './archive'
import { AddPlaysPanel, GeneratePlaybookPanel, NewFolderForm, type AddMode } from './FolderForms'
import { buildPlaybook, findTemplate, PLAYBOOK_TEMPLATES } from './playbooks'
import {
  breadcrumb,
  canAddSubfolder,
  childFolders,
  defaultKind,
  folderNameError,
  KIND_LABEL,
  liveFolders,
  playIdsIn,
  subtreePlayCount,
  type Folder,
  type FolderKind,
  type FolderLink,
} from './folders'
import { blankPlay, nameFromFile, parsePlayUpload, type NewPlay } from './newPlays'

const TABS = ['Team', 'Playbooks', 'Plays', 'Scout', 'Homework'] as const

type Panel = { kind: 'folder' } | { kind: 'add'; mode: AddMode } | { kind: 'generate' } | null

function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
}

function tabHref(tab: (typeof TABS)[number]): string {
  if (tab === 'Team') return '/team'
  if (tab === 'Playbooks') return '/playbook'
  return '/team'
}

let demoSerial = 0

/** Ids for rows made in the no-backend demo. */
function demoId(): string {
  demoSerial += 1
  return `demo-${demoSerial}`
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

function FolderGlyph({ kind }: { kind: FolderKind }) {
  return (
    <svg className="folder-glyph" data-kind={kind} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
    </svg>
  )
}

export function PlaybookPage() {
  const snap = useAuth()
  const [params, setParams] = useSearchParams()
  const fixture =
    supabase == null || honorDemoRoster(params.get('roster'), supabase != null, import.meta.env.DEV)
  const playerView =
    params.get('roster') === 'player' || (supabase != null && snap.role === 'player')
  const staff = !playerView && (fixture || snap.role === 'head_coach' || snap.role === 'coach')
  const folderId = params.get('folder')

  const [plays, setPlays] = useState<PlayRow[]>(() =>
    fixture
      ? DEMO_PLAYS.filter((play) =>
          playerView
            ? DEMO_LINKS.some((link) => link.folderId === 'base' && link.playId === play.id)
            : true,
        )
      : [],
  )
  const [archived, setArchived] = useState<PlayRow[]>(() => (fixture && staff ? DEMO_ARCHIVED : []))
  const [folders, setFolders] = useState<Folder[]>(() =>
    fixture ? (playerView ? DEMO_FOLDERS.filter((f) => f.id === 'base') : DEMO_FOLDERS) : [],
  )
  const [links, setLinks] = useState<FolderLink[]>(fixture ? DEMO_LINKS : [])
  const [list, setList] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const viewingArchived = staff && list === 'archived'
  const fetchKey =
    fixture || supabase == null || snap.session == null || snap.teamId == null
      ? null
      : `${snap.teamId}\0${staff ? '1' : '0'}`
  const loading = !fixture && (fetchKey == null || fetchKey !== settledKey)

  const live = useMemo(() => liveFolders(folders), [folders])
  const liveIds = useMemo(() => new Set(live.map((folder) => folder.id)), [live])
  const current = folderId != null && liveIds.has(folderId) ? folderId : null
  const path = breadcrumb(live, current)
  const here = path[path.length - 1] ?? null

  const refresh = useCallback(async () => {
    if (supabase == null || snap.teamId == null) return
    const teamId = snap.teamId
    const [nextPlays, tree, nextArchived] = await Promise.all([
      listPlays(teamId),
      listFolders(teamId),
      staff ? listArchivedPlays(teamId) : Promise.resolve([] as PlayRow[]),
    ])
    setPlays(nextPlays)
    setFolders(tree.folders)
    setLinks(tree.links)
    setArchived(nextArchived)
  }, [snap.teamId, staff])

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (fetchKey == null) return
    let dead = false
    const key = fetchKey
    void (async () => {
      try {
        await refresh()
      } catch (error) {
        if (!dead) setNotice(errorText(error, 'Could not load plays'))
      } finally {
        if (!dead) setSettledKey(key)
      }
    })()
    return () => {
      dead = true
    }
  }, [fetchKey, refresh])

  if (!fixture && snap.ready && snap.session == null) {
    return <Navigate to="/login?next=/playbook" replace />
  }

  function openFolder(next: string | null) {
    const nextParams = new URLSearchParams(params)
    if (next == null) nextParams.delete('folder')
    else nextParams.set('folder', next)
    setParams(nextParams)
    setList('active')
    setPanel(null)
    setRenaming(null)
    setConfirmDelete(null)
    setNotice(null)
    setSuccess(null)
  }

  function done(text: string) {
    setNotice(null)
    setSuccess(text)
  }

  function failed(error: unknown, fallback: string) {
    setSuccess(null)
    setNotice(errorText(error, fallback))
  }

  const searching = search.trim().length > 0
  const folderPlayIds = playIdsIn(
    links,
    current,
    plays.map((play) => play.id),
    liveIds,
  )
  const shown = viewingArchived
    ? visiblePlays({ staff, list, active: plays, archived, search })
    : searching
      ? visiblePlays({ staff, list: 'active', active: plays, archived, search })
      : plays.filter((play) => folderPlayIds.has(play.id))
  const subfolders = viewingArchived || searching ? [] : childFolders(live, current)
  const status =
    subfolders.length > 0
      ? null
      : listStatus({ loading, count: shown.length, archived: viewingArchived })
  const emptyFolder = status === 'No plays' && current != null ? 'This folder is empty' : status

  async function commitRename(playId: string) {
    const name = draftName.trim()
    if (name.length < 1) return
    if (!fixture) {
      try {
        await renamePlay(playId, name)
      } catch (error) {
        failed(error, 'Rename failed')
        return
      }
    }
    setPlays((rows) => rows.map((play) => (play.id === playId ? { ...play, name } : play)))
    setRenaming(null)
    setNotice(null)
    setSuccess(null)
  }

  async function commitFolderRename(id: string) {
    const name = draftName.trim()
    const problem = folderNameError(name)
    if (problem != null) {
      setNotice(problem)
      return
    }
    if (!fixture) {
      try {
        await renameFolder(id, name)
      } catch (error) {
        failed(error, 'Rename failed')
        return
      }
    }
    setFolders((rows) => rows.map((folder) => (folder.id === id ? { ...folder, name } : folder)))
    setRenaming(null)
    setNotice(null)
    setSuccess(null)
  }

  async function commitDelete(playId: string) {
    if (!fixture) {
      try {
        await deletePlay(playId)
      } catch (error) {
        failed(error, 'Delete failed')
        return
      }
    }
    const removed = plays.find((play) => play.id === playId)
    setPlays((rows) => rows.filter((play) => play.id !== playId))
    if (removed != null && staff) {
      setArchived((rows) => [...rows, removed].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setNotice(null)
    setSuccess(null)
  }

  async function commitFolderDelete(folder: Folder) {
    if (!fixture) {
      try {
        await archiveFolder(folder.id)
      } catch (error) {
        failed(error, 'Delete failed')
        return
      }
    }
    setFolders((rows) =>
      rows.map((row) => (row.id === folder.id ? { ...row, archived: true } : row)),
    )
    setConfirmDelete(null)
    done(`${folder.name} deleted. Its plays are still in All plays.`)
  }

  async function commitRemove(playId: string) {
    if (current == null) return
    if (!fixture) {
      try {
        await removeFromFolder(current, playId)
      } catch (error) {
        failed(error, 'Could not remove the play')
        return
      }
    }
    setLinks((rows) =>
      rows.filter((link) => !(link.folderId === current && link.playId === playId)),
    )
    setNotice(null)
    setSuccess(null)
  }

  async function commitRestore(playId: string) {
    const view = { list, active: plays, archived, notice, success }
    if (!fixture) {
      try {
        await restorePlay(playId)
      } catch (error) {
        const next = afterRestore(view, playId, error)
        setNotice(next.notice)
        setSuccess(next.success)
        return
      }
    }
    const next = afterRestore(view, playId, null)
    setPlays(next.active)
    setArchived(next.archived)
    setList(next.list)
    setNotice(next.notice)
    setSuccess(next.success)
  }

  async function createSubfolder(name: string, kind: FolderKind) {
    let folder: Folder
    if (fixture) {
      folder = { id: demoId(), name, parentId: current, kind, archived: false }
    } else {
      if (snap.teamId == null) throw new Error('No team')
      folder = await createFolder({ teamId: snap.teamId, name, parentId: current, kind })
    }
    setFolders((rows) => [...rows, folder])
    setPanel(null)
    done(`${name} created`)
  }

  async function addExisting(playIds: string[]) {
    if (current == null) return
    if (!fixture) await fileInFolder(current, playIds)
    setLinks((rows) => [...rows, ...playIds.map((playId) => ({ folderId: current, playId }))])
    setPanel(null)
    done(playIds.length === 1 ? 'Added 1 play' : `Added ${playIds.length} plays`)
  }

  async function saveNew(play: NewPlay, folderId: string | null = current): Promise<void> {
    if (fixture) {
      const id = demoId()
      const row: PlayRow = {
        id,
        team_id: 'demo',
        name: play.source.name,
        side: play.source.side,
        current_version: 1,
        default_look_id: null,
        updated_at: '2026-11-05T00:00:00.000Z',
      }
      setPlays((rows) => [...rows, row].sort((a, b) => a.name.localeCompare(b.name)))
      if (folderId != null) setLinks((rows) => [...rows, { folderId, playId: id }])
      return
    }
    if (snap.teamId == null) throw new Error('No team')
    await createPlay({ teamId: snap.teamId, folderId, play })
  }

  /** Files a starter playbook as a new folder here, one saved play per concept. */
  async function generate(templateId: string): Promise<void> {
    const template = findTemplate(templateId)
    if (template == null) throw new Error('Unknown playbook')
    const plays = buildPlaybook(template.id)
    let folder: Folder
    if (fixture) {
      folder = {
        id: demoId(),
        name: template.name,
        parentId: current,
        kind: 'playbook',
        archived: false,
      }
    } else {
      if (snap.teamId == null) throw new Error('No team')
      folder = await createFolder({
        teamId: snap.teamId,
        name: template.name,
        parentId: current,
        kind: 'playbook',
      })
    }
    setFolders((rows) => [...rows, folder])
    for (const play of plays) await saveNew(play, folder.id)
    if (!fixture) await refresh()
    setPanel(null)
    done(`${template.name} created with ${plays.length} plays`)
  }

  async function upload(files: File[]): Promise<string[]> {
    const problems: string[] = []
    let added = 0
    for (const file of files) {
      const parsed = parsePlayUpload(await file.text(), nameFromFile(file.name))
      if (!parsed.ok) {
        problems.push(`${file.name}: ${parsed.error}`)
        continue
      }
      try {
        await saveNew(parsed.play)
        added += 1
      } catch (error) {
        problems.push(`${file.name}: ${errorText(error, 'save failed')}`)
      }
    }
    if (!fixture && added > 0) await refresh()
    if (added > 0) done(added === 1 ? 'Uploaded 1 play' : `Uploaded ${added} plays`)
    return problems
  }

  async function addBlank(name: string) {
    await saveNew(blankPlay(name))
    if (!fixture) await refresh()
    done(`${name} created`)
  }

  const candidates = current == null ? [] : plays.filter((play) => !folderPlayIds.has(play.id))

  return (
    <div className="coach-frame playbook-page">
      {playerView ? null : (
        <nav className="side-nav" aria-label="Coach">
          {TABS.map((tab) => (
            <Link key={tab} to={tabHref(tab)}>
              {tab}
            </Link>
          ))}
        </nav>
      )}
      <div className="coach-main">
        <header className="roster-head">
          {playerView ? null : (
            <button
              type="button"
              className="nav-toggle"
              aria-label="Menu"
              onClick={() => setMenuOpen(true)}
            >
              Menu
            </button>
          )}
          <h1>Playbook</h1>
          <AccountMenu name={playerView ? 'Player' : (snap.session?.user.email ?? 'Coach Kim')} />
        </header>
        <input
          className="playbook-search"
          type="search"
          aria-label="Search plays"
          placeholder="Search all plays"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {staff ? (
          <div className="roster-filters" role="group" aria-label="Show">
            <button type="button" aria-pressed={!viewingArchived} onClick={() => setList('active')}>
              Folders
            </button>
            <button
              type="button"
              aria-pressed={viewingArchived}
              onClick={() => {
                setList('archived')
                setPanel(null)
                setRenaming(null)
              }}
            >
              Archived
            </button>
          </div>
        ) : null}

        {!viewingArchived && !searching ? (
          <nav className="folder-crumbs" aria-label="Folder path">
            <ol>
              <li>
                {current == null ? (
                  <span aria-current="page">All plays</span>
                ) : (
                  <button type="button" onClick={() => openFolder(null)}>
                    All plays
                  </button>
                )}
              </li>
              {path.map((folder, index) => (
                <li key={folder.id}>
                  {index === path.length - 1 ? (
                    <span aria-current="page">{folder.name}</span>
                  ) : (
                    <button type="button" onClick={() => openFolder(folder.id)}>
                      {folder.name}
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {here != null ? (
              <span className="folder-kind" data-kind={here.kind}>
                {KIND_LABEL[here.kind]}
              </span>
            ) : null}
          </nav>
        ) : null}

        {staff && !viewingArchived && !searching ? (
          <div className="folder-toolbar">
            {canAddSubfolder(live, current) ? (
              <button
                type="button"
                className="playbook-action"
                aria-expanded={panel?.kind === 'folder'}
                onClick={() => setPanel(panel?.kind === 'folder' ? null : { kind: 'folder' })}
              >
                New folder
              </button>
            ) : null}
            {canAddSubfolder(live, current) ? (
              <button
                type="button"
                className="playbook-action"
                aria-expanded={panel?.kind === 'generate'}
                onClick={() => setPanel(panel?.kind === 'generate' ? null : { kind: 'generate' })}
              >
                Generate playbook
              </button>
            ) : null}
            <button
              type="button"
              className="playbook-action primary"
              aria-expanded={panel?.kind === 'add'}
              onClick={() =>
                setPanel(
                  panel?.kind === 'add'
                    ? null
                    : { kind: 'add', mode: current == null ? 'upload' : 'existing' },
                )
              }
            >
              Add plays
            </button>
          </div>
        ) : null}

        {panel?.kind === 'folder' ? (
          <NewFolderForm
            parentName={here?.name ?? null}
            initialKind={defaultKind(live, current)}
            onCreate={createSubfolder}
            onCancel={() => setPanel(null)}
          />
        ) : null}
        {panel?.kind === 'generate' ? (
          <GeneratePlaybookPanel
            parentName={here?.name ?? null}
            templates={PLAYBOOK_TEMPLATES}
            onGenerate={generate}
            onCancel={() => setPanel(null)}
          />
        ) : null}
        {panel?.kind === 'add' ? (
          <AddPlaysPanel
            key={current ?? 'root'}
            folderName={here?.name ?? null}
            candidates={candidates}
            initialMode={panel.mode}
            onAddExisting={addExisting}
            onUpload={upload}
            onBlank={addBlank}
            onClose={() => setPanel(null)}
          />
        ) : null}

        {success ? (
          <p className="playbook-success" role="status">
            {success}
          </p>
        ) : null}
        {notice ? (
          <p className="auth-error" role="alert">
            {notice}
          </p>
        ) : null}

        {subfolders.length > 0 ? (
          <ul className="playbook-list folder-list" aria-label="Folders">
            {subfolders.map((folder) => (
              <li key={folder.id} className="playbook-row folder-row">
                {renaming === folder.id ? (
                  <form
                    className="playbook-rename"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void commitFolderRename(folder.id)
                    }}
                  >
                    <input
                      aria-label={`Name for ${folder.name}`}
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                    <button type="submit" className="playbook-action">
                      Save name
                    </button>
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : confirmDelete === folder.id ? (
                  <div className="folder-confirm" role="group" aria-label={`Delete ${folder.name}`}>
                    <span className="playbook-name">
                      Delete {folder.name} and its subfolders? Plays stay in All plays.
                    </span>
                    <span className="playbook-actions">
                      <button
                        type="button"
                        className="playbook-action danger"
                        onClick={() => void commitFolderDelete(folder)}
                      >
                        Delete folder
                      </button>
                      <button
                        type="button"
                        className="playbook-action"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="folder-open"
                      onClick={() => openFolder(folder.id)}
                    >
                      <FolderGlyph kind={folder.kind} />
                      <span className="playbook-name">{folder.name}</span>
                      <span className="folder-meta">
                        {folder.kind === 'opponent' ? 'Opponent · ' : ''}
                        {(() => {
                          const count = subtreePlayCount(live, links, folder.id)
                          return count === 1 ? '1 play' : `${count} plays`
                        })()}
                      </span>
                    </button>
                    {staff ? (
                      <span className="playbook-actions">
                        <button
                          type="button"
                          className="playbook-action"
                          onClick={() => {
                            setRenaming(folder.id)
                            setDraftName(folder.name)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="playbook-action"
                          onClick={() => setConfirmDelete(folder.id)}
                        >
                          Delete
                        </button>
                      </span>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {emptyFolder ? <p className={loading ? 'loading-line' : undefined}>{emptyFolder}</p> : null}
        {current == null && !searching && !viewingArchived && shown.length > 0 ? (
          <h2 className="folder-heading">Not in a folder</h2>
        ) : null}
        <ul className="playbook-list" aria-label="Plays">
          {shown.map((play) => (
            <li key={play.id} className="playbook-row">
              <span className="playbook-name">{play.name}</span>
              {renaming === play.id ? (
                <form
                  className="playbook-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void commitRename(play.id)
                  }}
                >
                  <input
                    aria-label={`Name for ${play.name}`}
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                  <button type="submit" className="playbook-action">
                    Save name
                  </button>
                </form>
              ) : (
                <span className="playbook-actions">
                  {staff && viewingArchived ? (
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => void commitRestore(play.id)}
                    >
                      Restore
                    </button>
                  ) : null}
                  {staff && !viewingArchived ? (
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => {
                        setRenaming(play.id)
                        setDraftName(play.name)
                      }}
                    >
                      Rename
                    </button>
                  ) : null}
                  {staff && !viewingArchived && !searching && current != null ? (
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => void commitRemove(play.id)}
                    >
                      Remove from folder
                    </button>
                  ) : null}
                  {staff && !viewingArchived ? (
                    <button
                      type="button"
                      className="playbook-action"
                      onClick={() => void commitDelete(play.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {playerView ? null : (
        <nav className="tab-bar" aria-label="Coach">
          {TABS.map((tab) => (
            <Link key={tab} to={tabHref(tab)}>
              {tab}
            </Link>
          ))}
        </nav>
      )}
      {menuOpen ? (
        <div className="nav-drawer">
          <button type="button" className="nav-toggle" onClick={() => setMenuOpen(false)}>
            Close
          </button>
          {TABS.map((tab) => (
            <Link key={tab} to={tabHref(tab)} onClick={() => setMenuOpen(false)}>
              {tab}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
