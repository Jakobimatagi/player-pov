/** Up to two initials from a name or an email's local part. */
export function initialsOf(name: string): string {
  const base = name.includes('@') ? (name.split('@')[0] ?? name) : name
  return (
    base
      .split(/[\s._-]+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '•'
  )
}
