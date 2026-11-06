import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileChart } from '../src/editor/compileAdapter'
import {
  breadcrumb,
  canAddSubfolder,
  childFolders,
  defaultKind,
  folderNameError,
  liveFolders,
  MAX_FOLDER_DEPTH,
  playIdsIn,
  subtreePlayCount,
  type Folder,
  type FolderLink,
} from '../src/playbook/folders'
import { blankPlay, nameFromFile, parsePlayUpload } from '../src/playbook/newPlays'

const folder = (
  id: string,
  parentId: string | null,
  kind: Folder['kind'] = 'playbook',
  archived = false,
): Folder => ({ id, name: id, parentId, kind, archived })

// ours > base ; opp > 2026 > lincoln, opp > 2026 > central
const TREE: Folder[] = [
  folder('ours', null),
  folder('base', 'ours'),
  folder('opp', null, 'opponent'),
  folder('2026', 'opp', 'opponent'),
  folder('lincoln', '2026', 'opponent'),
  folder('central', '2026', 'opponent'),
]
const LINKS: FolderLink[] = [
  { folderId: 'base', playId: 'flood' },
  { folderId: 'lincoln', playId: 'sink' },
  { folderId: 'central', playId: 'sink' },
  { folderId: 'central', playId: 'blitz' },
]

describe('folder tree', () => {
  it('lists top-level folders and children by name', () => {
    expect(childFolders(TREE, null).map((f) => f.id)).toEqual(['opp', 'ours'])
    expect(childFolders(TREE, '2026').map((f) => f.id)).toEqual(['central', 'lincoln'])
  })

  it('treats a folder whose parent is hidden as top level', () => {
    const player = TREE.filter((f) => f.id === 'lincoln')
    expect(childFolders(player, null).map((f) => f.id)).toEqual(['lincoln'])
  })

  it('builds the breadcrumb from the top', () => {
    expect(breadcrumb(TREE, 'lincoln').map((f) => f.id)).toEqual(['opp', '2026', 'lincoln'])
    expect(breadcrumb(TREE, null)).toEqual([])
  })

  it('survives a cycle in bad data', () => {
    const loop = [folder('a', 'b'), folder('b', 'a')]
    expect(breadcrumb(loop, 'a').map((f) => f.id)).toEqual(['b', 'a'])
    expect(liveFolders(loop)).toHaveLength(2)
  })

  it('counts distinct plays in a subtree', () => {
    expect(subtreePlayCount(TREE, LINKS, 'opp')).toBe(2)
    expect(subtreePlayCount(TREE, LINKS, 'lincoln')).toBe(1)
    expect(subtreePlayCount(TREE, LINKS, 'ours')).toBe(1)
  })

  it('hides archived folders and everything under them', () => {
    const tree = TREE.map((f) => (f.id === '2026' ? { ...f, archived: true } : f))
    expect(
      liveFolders(tree)
        .map((f) => f.id)
        .sort(),
    ).toEqual(['base', 'opp', 'ours'])
  })

  it('lists plays filed in a folder, and unfiled plays at the top', () => {
    const all = ['flood', 'sink', 'blitz', 'iso']
    const live = new Set(TREE.map((f) => f.id))
    expect([...playIdsIn(LINKS, 'central', all, live)].sort()).toEqual(['blitz', 'sink'])
    expect([...playIdsIn(LINKS, null, all, live)]).toEqual(['iso'])
  })

  it('counts a play in an archived folder as unfiled', () => {
    const live = new Set(['ours', 'base', 'opp'])
    expect([...playIdsIn(LINKS, null, ['flood', 'sink', 'blitz'], live)].sort()).toEqual([
      'blitz',
      'sink',
    ])
  })

  it('stops new subfolders at the depth cap', () => {
    const chain: Folder[] = []
    for (let i = 0; i < MAX_FOLDER_DEPTH; i += 1) {
      chain.push(folder(`f${i}`, i === 0 ? null : `f${i - 1}`))
    }
    expect(canAddSubfolder(chain, `f${MAX_FOLDER_DEPTH - 2}`)).toBe(true)
    expect(canAddSubfolder(chain, `f${MAX_FOLDER_DEPTH - 1}`)).toBe(false)
    expect(canAddSubfolder(chain, null)).toBe(true)
  })

  it('gives a new subfolder its parent kind', () => {
    expect(defaultKind(TREE, '2026')).toBe('opponent')
    expect(defaultKind(TREE, null)).toBe('playbook')
  })

  it('checks folder names', () => {
    expect(folderNameError('  ')).toBe('Enter a folder name')
    expect(folderNameError('x'.repeat(81))).toMatch(/under 80/)
    expect(folderNameError('Lincoln High')).toBeNull()
  })
})

describe('new plays', () => {
  it('makes a blank play that compiles and has no routes', () => {
    const play = blankPlay('  Red 22  ')
    expect(play.source.name).toBe('Red 22')
    expect(play.source.players.every((p) => p.legs.length === 0)).toBe(true)
    expect(play.source.adjustments).toEqual([])
    expect(compileChart(play.source, play.look).play).not.toBeNull()
  })

  it('reads a play source file against its default look', () => {
    const text = readFileSync('fixtures/trips-flood.source.json', 'utf8')
    const parsed = parsePlayUpload(text, 'x')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.play.source.name).toBe('Trips Right Flood')
      expect(parsed.play.look.id).toBe('cover-2')
    }
  })

  it('reads a compiled play file', () => {
    const text = readFileSync('public/plays/trips-right-vs-cover2.json', 'utf8')
    const parsed = parsePlayUpload(text, 'x')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.play.source.players).toHaveLength(11)
  })

  it('names a nameless upload after the file', () => {
    const source = JSON.parse(readFileSync('fixtures/trips-flood.source.json', 'utf8'))
    source.name = ''
    const parsed = parsePlayUpload(JSON.stringify(source), nameFromFile('Lincoln Sink.source.json'))
    expect(parsed.ok && parsed.play.source.name).toBe('Lincoln Sink')
  })

  it('rejects files that are not plays', () => {
    expect(parsePlayUpload('nope', 'x')).toEqual({ ok: false, error: 'That file is not JSON' })
    expect(parsePlayUpload('{"hello":1}', 'x').ok).toBe(false)
    expect(parsePlayUpload('{"sourceVersion":1}', 'x')).toEqual({
      ok: false,
      error: 'That play source has missing or bad fields',
    })
  })
})
