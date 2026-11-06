/** Where Back to editor goes until the editor route exists. A direct load uses `default`. */
export function draftBackTarget(historyKey: string): -1 | '/' {
  if (historyKey !== 'default') return -1
  return '/'
}

/**
 * Where Back to plays goes from a saved play. A visit from inside the app goes
 * back one step, so the playbook keeps its folder. A direct load uses `default`.
 */
export function playsBackTarget(historyKey: string): -1 | '/playbook' {
  if (historyKey !== 'default') return -1
  return '/playbook'
}
