import { useState } from 'react'
import { useNavigate } from 'react-router'
import { signOut } from '../auth/session'

export function AccountMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const initials = name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function out(scope: 'local' | 'global') {
    await signOut(scope)
    navigate('/login?signedout=1', { replace: true })
  }

  return (
    <div className="account">
      <button
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((value) => !value)}
      >
        {initials || '•'}
      </button>
      {open ? (
        <div className="account-menu" role="menu">
          <p className="account-name">{name}</p>
          <button type="button" role="menuitem" onClick={() => void out('local')}>
            Sign out
          </button>
          <button type="button" role="menuitem" onClick={() => void out('global')}>
            Sign out everywhere
          </button>
        </div>
      ) : null}
    </div>
  )
}
