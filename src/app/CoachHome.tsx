import { Link } from 'react-router'
import { AccountMenu } from './AccountMenu'
import './coachHome.css'

interface Destination {
  to: string
  label: string
  blurb: string
}

/** Only places that exist. The draw board is a dev preview until C7 adds /plays/new. */
function destinations(dev: boolean): Destination[] {
  const list: Destination[] = [
    { to: '/playbook', label: 'Playbook', blurb: 'Plays, playbooks and opponent folders' },
    { to: '/team', label: 'Team', blurb: 'Roster, coaches and invites' },
  ]
  if (dev) {
    list.push({ to: '/dev/editor', label: 'Draw a play', blurb: 'Draw board preview (dev only)' })
  }
  return list
}

export function CoachHome({ name, dev = import.meta.env.DEV }: { name: string; dev?: boolean }) {
  const places = destinations(dev)
  return (
    <div className="coach-frame coach-home">
      <nav className="side-nav" aria-label="Coach">
        <Link to="/" aria-current="page">
          Home
        </Link>
        {places.map((place) => (
          <Link key={place.to} to={place.to}>
            {place.label}
          </Link>
        ))}
      </nav>
      <div className="coach-main">
        <header className="roster-head">
          <h1>Coach home</h1>
          <AccountMenu name={name} />
        </header>
        <ul className="coach-home-cards">
          {places.map((place) => (
            <li key={place.to}>
              <Link className="coach-home-card" to={place.to}>
                <span className="coach-home-card-title">{place.label}</span>
                <span className="coach-home-card-blurb">{place.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <nav className="tab-bar" aria-label="Coach">
        <Link to="/" aria-current="page">
          Home
        </Link>
        {places.map((place) => (
          <Link key={place.to} to={place.to}>
            {place.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
