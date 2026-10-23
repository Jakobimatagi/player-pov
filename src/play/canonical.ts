/**
 * Sorted-key JSON. The node checksum and the browser checksum both hash this string.
 * Keys whose value is `undefined` are omitted, matching `JSON.stringify`.
 * Numbers follow `JSON.stringify`: `-0` is `0`, and a magnitude of `1e21` or more
 * uses exponential form (`1e+21`).
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
