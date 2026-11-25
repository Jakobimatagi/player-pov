/**
 * npm run film:hudl -- "<export>.zip" [--out <folder>]
 *
 * Joins a Hudl-style export (one clip per play per angle, plus breakdown.xlsx) into one
 * game video per angle, and writes a plays file next to each for /film → Import plays.
 * Needs ffmpeg, ffprobe and unzip on PATH. The video is copied, not re-encoded.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { formatBytes, FILM_MAX_BYTES } from './uploadPlan'
import {
  breakdownRows,
  buildPlaysFile,
  parseClipName,
  readSheet,
  type ClipLength,
} from './hudlBreakdown'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith('--'))
const outFlag = args.indexOf('--out')
if (!input) fail('usage: npm run film:hudl -- "<export>.zip" [--out <folder>]')

const run = (cmd: string, argv: string[]) =>
  execFileSync(cmd, argv, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

for (const tool of ['ffmpeg', 'ffprobe', 'unzip']) {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' })
  } catch {
    fail(`${tool} is not installed. On a Mac: brew install ffmpeg`)
  }
}

const inputPath = resolve(input)
const isZip = extname(inputPath).toLowerCase() === '.zip'
// "Mountain Ridge vs CC - Intercut 11-12-2026 (9996786).zip" → "Mountain Ridge vs CC - Intercut 11-12-2026"
const title = basename(inputPath, isZip ? extname(inputPath) : '')
  .replace(/\s*\(\d+\)\s*$/, '')
  .trim()
const outDir = resolve(
  outFlag >= 0 && args[outFlag + 1] ? args[outFlag + 1]! : join(dirname(inputPath), title),
)
const work = mkdtempSync(join(tmpdir(), 'hudl-'))

try {
  let folder = inputPath
  if (isZip) {
    console.log(`Unzipping ${basename(inputPath)}…`)
    folder = join(work, 'export')
    mkdirSync(folder)
    execFileSync('unzip', ['-q', inputPath, '-d', folder], { stdio: 'inherit' })
  }

  // Clips and the breakdown, wherever they sit inside the export.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name === '__MACOSX') continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else files.push(path)
    }
  }
  walk(folder)

  const angles = new Map<string, { playNumber: number; path: string }[]>()
  for (const path of files) {
    const clip = parseClipName(basename(path))
    if (!clip) continue
    const list = angles.get(clip.angle) ?? []
    list.push({ playNumber: clip.playNumber, path })
    angles.set(clip.angle, list)
  }
  if (angles.size === 0) fail('No clips named like "Wide - Clip 001.mp4" were found.')

  const xlsx = files.find((f) => extname(f).toLowerCase() === '.xlsx')
  let rows: Record<string, string>[] = []
  if (xlsx) {
    const part = (name: string) => {
      try {
        return run('unzip', ['-p', xlsx, name])
      } catch {
        return null
      }
    }
    const sheet = part('xl/worksheets/sheet1.xml')
    if (!sheet) fail(`${basename(xlsx)} has no first sheet.`)
    rows = breakdownRows(readSheet(sheet, part('xl/sharedStrings.xml')))
    console.log(`Breakdown: ${rows.length} plays in ${basename(xlsx)}`)
  } else {
    console.log('No breakdown .xlsx found; plays will have times but no tags.')
  }

  mkdirSync(outDir, { recursive: true })

  for (const [angle, clips] of angles) {
    clips.sort((a, b) => a.playNumber - b.playNumber)
    console.log(`\n${angle}: probing ${clips.length} clips…`)

    const lengths: ClipLength[] = []
    const shapes = new Map<string, number[]>()
    for (const c of clips) {
      const probe = JSON.parse(
        run('ffprobe', [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_entries',
          'stream=codec_type,codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels',
          c.path,
        ]),
      ) as { format: { duration?: string }; streams: Record<string, string | number>[] }
      const seconds = Number(probe.format.duration)
      if (!Number.isFinite(seconds) || seconds <= 0)
        fail(`Could not read the length of ${basename(c.path)}.`)
      lengths.push({ playNumber: c.playNumber, durationMs: Math.round(seconds * 1000) })
      const shape = probe.streams
        .map((s) =>
          [
            s.codec_type,
            s.codec_name,
            s.profile,
            s.width,
            s.height,
            s.r_frame_rate,
            s.pix_fmt,
            s.sample_rate,
            s.channels,
          ].join(':'),
        )
        .join(' | ')
      shapes.set(shape, [...(shapes.get(shape) ?? []), c.playNumber])
    }
    if (shapes.size > 1) {
      const lines = [...shapes].map(
        ([shape, plays]) => `  ${plays.length} clips (e.g. play ${plays[0]}): ${shape}`,
      )
      fail(
        `${angle} clips are not all the same format, so they can't be joined without re-encoding:\n${lines.join('\n')}`,
      )
    }

    const list = join(work, `${angle}.txt`)
    writeFileSync(
      list,
      clips.map((c) => `file '${c.path.replace(/'/g, "'\\''")}'`).join('\n') + '\n',
    )
    const video = join(outDir, `${title} - ${angle}.mp4`)
    console.log(`${angle}: joining into ${basename(video)}…`)
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        video,
      ],
      { stdio: 'inherit' },
    )

    const { file, missing } = buildPlaysFile({ title, angle, clips: lengths, rows })
    const joinedMs = Math.round(
      Number(
        run('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'csv=p=0',
          video,
        ]),
      ) * 1000,
    )
    const drift = joinedMs - file.durationMs
    if (Math.abs(drift) > 1000) {
      console.warn(
        `  Warning: the joined video is ${drift} ms off the clip total; late plays may start slightly early or late.`,
      )
    }
    file.durationMs = joinedMs
    const playsPath = join(outDir, `${title} - ${angle}.plays.json`)
    writeFileSync(playsPath, JSON.stringify(file, null, 2) + '\n')

    const size = statSync(video).size
    const tagged = file.plays.filter(
      (p) => p.side != null || p.formation != null || p.front != null,
    ).length
    console.log(`  ${basename(video)}  ${formatBytes(size)}, ${Math.round(joinedMs / 60000)} min`)
    console.log(
      `  ${basename(playsPath)}  ${file.plays.length} plays, ${tagged} with breakdown tags`,
    )
    if (missing.length) console.log(`  No ${angle} clip for play ${missing.join(', ')}`)
    if (size > FILM_MAX_BYTES)
      console.warn('  Warning: over the 20 GB film limit. Export at 720p from Hudl.')
  }

  console.log(`\nDone. Files are in ${outDir}`)
  console.log(
    'On /film: upload each video, then use Import plays on it and choose its .plays.json.',
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}
