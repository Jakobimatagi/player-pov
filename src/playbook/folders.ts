/** A playbook row seen as a folder. `kind` marks our own book or a scouted opponent. */
export type FolderKind = 'playbook' | 'opponent'

export interface Folder {
  id: string
  name: string
  parentId: string | null
  kind: FolderKind
  archived: boolean
}

/** One play filed in one folder. A play can be filed in several folders. */
export interface FolderLink {
  folderId: string
  playId: string
}

export const MAX_FOLDER_DEPTH = 8

export const KIND_LABEL: Record<FolderKind, string> = {
  playbook: 'Playbook',
  opponent: 'Scouted opponent',
}

function byName(a: Folder, b: Folder): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true })
}

/**
 * Folders that are not archived and have no archived folder above them.
 * A folder whose parent the caller cannot see (a player's assigned subfolder)
 * counts as a top-level folder.
 */
export function liveFolders(folders: readonly Folder[]): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  return folders.filter((folder) => {
    const seen = new Set<string>()
    let current: Folder | undefined = folder
    while (current != null && !seen.has(current.id)) {
      if (current.archived) return false
      seen.add(current.id)
      current = current.parentId == null ? undefined : byId.get(current.parentId)
    }
    return true
  })
}

/** Children of `parentId`, or the top level when it is null. */
export function childFolders(folders: readonly Folder[], parentId: string | null): Folder[] {
  const ids = new Set(folders.map((folder) => folder.id))
  return folders
    .filter((folder) =>
      parentId == null
        ? folder.parentId == null || !ids.has(folder.parentId)
        : folder.parentId === parentId,
    )
    .sort(byName)
}

/** The path from the top to `id`, inclusive. Empty when `id` is unknown. */
export function breadcrumb(folders: readonly Folder[], id: string | null): Folder[] {
  if (id == null) return []
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: Folder[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current != null && !seen.has(current.id)) {
    path.unshift(current)
    seen.add(current.id)
    current = current.parentId == null ? undefined : byId.get(current.parentId)
  }
  return path
}

/** `id` and every folder below it. */
export function subtreeIds(folders: readonly Folder[], id: string): Set<string> {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      if (folder.parentId != null && out.has(folder.parentId) && !out.has(folder.id)) {
        out.add(folder.id)
        grew = true
      }
    }
  }
  return out
}

/** Distinct plays anywhere in the folder's subtree. */
export function subtreePlayCount(
  folders: readonly Folder[],
  links: readonly FolderLink[],
  id: string,
): number {
  const ids = subtreeIds(folders, id)
  return new Set(links.filter((link) => ids.has(link.folderId)).map((link) => link.playId)).size
}

/** Play ids filed directly in a folder, or the unfiled plays when it is null. */
export function playIdsIn(
  links: readonly FolderLink[],
  folderId: string | null,
  allPlayIds: readonly string[],
  liveFolderIds: ReadonlySet<string>,
): Set<string> {
  if (folderId != null) {
    return new Set(links.filter((link) => link.folderId === folderId).map((link) => link.playId))
  }
  const filed = new Set(
    links.filter((link) => liveFolderIds.has(link.folderId)).map((link) => link.playId),
  )
  return new Set(allPlayIds.filter((id) => !filed.has(id)))
}

/** Depth of `id` counting from 1 at the top. */
export function depthOf(folders: readonly Folder[], id: string | null): number {
  return breadcrumb(folders, id).length
}

export function canAddSubfolder(folders: readonly Folder[], parentId: string | null): boolean {
  return depthOf(folders, parentId) < MAX_FOLDER_DEPTH
}

/** A new subfolder starts with its parent's kind. */
export function defaultKind(folders: readonly Folder[], parentId: string | null): FolderKind {
  if (parentId == null) return 'playbook'
  return folders.find((folder) => folder.id === parentId)?.kind ?? 'playbook'
}

export function folderNameError(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Enter a folder name'
  if (trimmed.length > 80) return 'Keep folder names under 80 characters'
  return null
}
