/** Where Back to editor goes until the editor route exists. A direct load uses `default`. */
export function draftBackTarget(historyKey: string): -1 | '/' {
  if (historyKey !== 'default') return -1
  return '/'
}
