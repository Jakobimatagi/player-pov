/** Helmet bars drawn in the DOM so they stay sharp and do not take a draw call. */
export function FacemaskOverlay({
  active,
  team,
}: {
  active: boolean
  team: 'offense' | 'defense'
}) {
  return (
    <svg
      className={active ? 'facemask is-on' : 'facemask'}
      data-testid="facemask"
      data-team={team}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect className="mask-bar" x="7" y="22" width="8" height="48" rx="1.5" />
      <rect className="mask-bar" x="85" y="22" width="8" height="48" rx="1.5" />
      <rect className="helmet-band" x="0" y="91" width="100" height="9" />
    </svg>
  )
}
