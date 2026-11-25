/**
 * The files of a Hudl export, whether the coach picked the zip or its unzipped folder.
 * Nothing is read until a file is opened, and nothing is sent anywhere.
 */
import { breakdownRows, readSheet } from './hudlBreakdown'
import { openZipEntry, readZipEntries, ZipError } from './zipReader'

export interface ExportFile {
  /** Path inside the export, e.g. "Game/Wide - Clip 001.mp4". */
  name: string
  size: number
  open(): Promise<Blob>
}

export async function filesFromZip(zip: Blob): Promise<ExportFile[]> {
  const entries = await readZipEntries(zip)
  return entries.map((entry) => ({
    name: entry.name,
    size: entry.size,
    open: () => openZipEntry(zip, entry),
  }))
}

/** Files from a folder picker or a drop. Uses the path inside the folder when there is one. */
export function filesFromFolder(files: Iterable<File>): ExportFile[] {
  return [...files].map((file) => ({
    name: file.webkitRelativePath || file.name,
    size: file.size,
    open: () => Promise.resolve(file),
  }))
}

const decoder = new TextDecoder()

/**
 * Rows of breakdown.xlsx keyed by header. Reads the first worksheet the workbook lists
 * (sheet1.xml when the workbook can't be read) and the shared strings.
 */
export async function readBreakdownXlsx(xlsx: Blob): Promise<Record<string, string>[]> {
  let entries
  try {
    entries = await readZipEntries(xlsx)
  } catch (err) {
    if (err instanceof ZipError) throw new ZipError('breakdown.xlsx is not a spreadsheet.')
    throw err
  }
  const byName = new Map(entries.map((e) => [e.name, e]))
  const text = async (name: string) => {
    const entry = byName.get(name)
    return entry ? decoder.decode(await (await openZipEntry(xlsx, entry)).arrayBuffer()) : null
  }

  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = await text('xl/workbook.xml')
  const rels = await text('xl/_rels/workbook.xml.rels')
  const firstSheetRel = workbook && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1]
  if (firstSheetRel && rels) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${firstSheetRel}"[^>]*>`).exec(rels)?.[0]
    const target = rel && /Target="([^"]+)"/.exec(rel)?.[1]
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`
  }
  const sheet =
    (await text(sheetPath)) ??
    (await text(
      [...byName.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0] ?? '',
    ))
  if (sheet == null) throw new ZipError('breakdown.xlsx has no sheet.')
  return breakdownRows(readSheet(sheet, await text('xl/sharedStrings.xml')))
}

/** "Mountain Ridge vs Corner Canyon.zip" → "Mountain Ridge vs Corner Canyon". */
export function titleFromExportName(name: string): string {
  const base = (name.split(/[\\/]/).filter(Boolean).pop() ?? '').replace(/\.zip$/i, '')
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** A dropped folder's files, walked through the entries API. Browser only. */
async function walkEntry(entry: FileSystemEntry, path: string, out: File[], paths: string[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    )
    out.push(file)
    paths.push(path + entry.name)
    return
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // readEntries returns at most 100 at a time; call it until it comes back empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (batch.length === 0) break
    for (const child of batch) await walkEntry(child, `${path}${entry.name}/`, out, paths)
  }
}

/**
 * What was dropped: a single zip, or the files of a dropped folder. Returns the name to
 * suggest as the game's title alongside.
 */
export async function filesFromDrop(
  data: DataTransfer,
): Promise<{ files: ExportFile[]; name: string } | null> {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => e != null)
  const folder = entries.find((e) => e.isDirectory)
  if (folder) {
    const files: File[] = []
    const paths: string[] = []
    await walkEntry(folder, '', files, paths)
    return {
      name: folder.name,
      files: files.map((file, i) => ({
        name: paths[i]!,
        size: file.size,
        open: () => Promise.resolve(file),
      })),
    }
  }
  const zip = [...data.files].find((f) => /\.zip$/i.test(f.name))
  return zip ? { files: await filesFromZip(zip), name: zip.name } : null
}
