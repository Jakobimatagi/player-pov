import { compilePlay } from './compile'
import { PlaySchema, collectWarnings, zodIssuesToErrors } from './schema'
import type { CompiledPlay, PlayFile, PlayLoadError, PlayWarning } from './types'

export const SAMPLE_PLAY_URL = '/plays/trips-right-vs-cover2.json'

export type PlayValidation =
  { ok: true; play: PlayFile; warnings: PlayWarning[] } | { ok: false; errors: PlayLoadError[] }

export function parseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON'
    return { ok: false, message: withLineColumn(text, message) }
  }
}

function withLineColumn(text: string, message: string): string {
  if (/line \d+ column \d+/.test(message)) return message
  const posMatch = /position (\d+)/.exec(message)
  if (posMatch == null) return message
  const pos = Number(posMatch[1])
  let line = 1
  let column = 1
  const limit = Math.min(pos, text.length)
  for (let i = 0; i < limit; i += 1) {
    if (text[i] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return `${message} (line ${line} column ${column})`
}

export function validatePlay(data: unknown): PlayValidation {
  if (typeof data === 'object' && data != null && 'schemaVersion' in data) {
    const version = (data as { schemaVersion: unknown }).schemaVersion
    if (version !== 1) {
      return {
        ok: false,
        errors: [
          {
            kind: 'version',
            path: 'schemaVersion',
            message: `unsupported play format v${String(version)}`,
          },
        ],
      }
    }
  }

  const parsed = PlaySchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, errors: zodIssuesToErrors(parsed.error, data) }
  }
  return { ok: true, play: parsed.data, warnings: collectWarnings(parsed.data) }
}

export async function fetchPlay(
  url: string,
): Promise<
  | { ok: true; url: string; play: CompiledPlay; warnings: PlayWarning[] }
  | { ok: false; url: string; errors: PlayLoadError[] }
> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    return {
      ok: false,
      url,
      errors: [{ kind: 'network', path: url, message }],
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'network', path: url, message: `HTTP ${response.status}` }],
    }
  }
  const text = await response.text()
  // Vite's SPA fallback answers a missing fixture with index.html and status 200.
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html') || text.trimStart().startsWith('<')) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'network', path: url, message: 'not found' }],
    }
  }
  const json = parseJson(text)
  if (!json.ok) {
    return {
      ok: false,
      url,
      errors: [{ kind: 'parse', path: url, message: json.message }],
    }
  }
  const result = validatePlay(json.value)
  if (!result.ok) return { ok: false, url, errors: result.errors }
  return { ok: true, url, play: compilePlay(result.play), warnings: result.warnings }
}
