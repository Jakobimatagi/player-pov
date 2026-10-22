import { readFileSync } from 'node:fs'
import { COVER_2_LOOK } from './cover2Look'
import { compileSource } from './compileSource'
import { validatePlay } from './load'
import { mapCompiledPath } from './sourceMap'
import type { LookSource, PlaySource } from './sourceTypes'

const sourcePath = process.argv[2]
if (sourcePath == null) {
  console.error('usage: npm run compile -- fixtures/<play>.source.json [look.json]')
  process.exit(1)
}
const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as PlaySource
const lookPath = process.argv[3]
const look =
  lookPath == null ? COVER_2_LOOK : (JSON.parse(readFileSync(lookPath, 'utf8')) as LookSource)
const compiled = compileSource(source, look)
const validated = validatePlay(compiled.play)
const lines = [
  ...compiled.errors.map((error) => `${error.path}: ${error.message}`),
  ...(validated.ok
    ? []
    : validated.errors.map(
        (error) => `${mapCompiledPath(compiled.sourceMap, error.path)}: ${error.message}`,
      )),
]
if (lines.length > 0) {
  console.log(lines.join('\n'))
  process.exit(1)
}
console.log(JSON.stringify(compiled.play, null, 2))
