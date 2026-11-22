/**
 * Decides, before any app code loads, whether this visit gets the public landing page.
 * Only a bare `/` with a configured backend and no saved Supabase session qualifies.
 * Auth redirects (`?code=`, `#access_token=`), demo links (`?home=`) and every other path
 * load the app router as before, which still sends logged-out deep links to /login.
 */
export function showLanding(visit: {
  pathname: string
  search: string
  hash: string
  backend: boolean
  storageKeys: readonly string[]
}): boolean {
  if (!visit.backend) return false
  if (visit.pathname !== '/' || visit.search !== '' || visit.hash !== '') return false
  return !visit.storageKeys.some((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
}

export function storageKeys(): string[] {
  try {
    return Object.keys(localStorage)
  } catch {
    return []
  }
}
