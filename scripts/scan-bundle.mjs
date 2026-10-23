import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const jwtPattern = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g

export function payloadRole(token) {
  const part = token.split('.')[1]
  if (part == null || part === '') return null
  const pad = part + '='.repeat((4 - (part.length % 4)) % 4)
  const json = Buffer.from(pad.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  const body = JSON.parse(json)
  return typeof body.role === 'string' ? body.role : null
}

export function scanText(text) {
  const hits = []
  if (/service_role|SUPABASE_SERVICE_ROLE|sb_secret_/.test(text)) hits.push('service role marker')
  // `{node:` is a minified object key, not an import. A real `node:` module is not.
  if (/(?<![{.\w])node:[a-z]/.test(text)) hits.push('node: import')
  for (const token of text.match(jwtPattern) ?? []) {
    try {
      if (payloadRole(token) === 'service_role') hits.push('JWT role is service_role')
    } catch {
      // A lookalike string is not a JWT payload.
    }
  }
  return hits
}

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
const root = process.argv[2]
if (isMain && root != null && root !== '') {
  let failed = false
  for (const file of walk(root)) {
    const hits = scanText(readFileSync(file, 'utf8'))
    for (const hit of hits) {
      console.error(`${file}: ${hit}`)
      failed = true
    }
  }
  if (failed) process.exit(1)
}
