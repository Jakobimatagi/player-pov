import { useState } from 'react'
import { useNavigate } from 'react-router'
import Avatar from '@mui/material/Avatar'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import LogoutIcon from '@mui/icons-material/Logout'
import PhonelinkEraseIcon from '@mui/icons-material/PhonelinkErase'
import { signOut } from '../auth/session'

export function AccountMenu({ name }: { name: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const navigate = useNavigate()
  const initials = name
    .split(/[\s@._-]+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function out(scope: 'local' | 'global') {
    setAnchor(null)
    await signOut(scope)
    navigate('/login?signedout=1', { replace: true })
  }

  return (
    <div className="account">
      <IconButton
        aria-haspopup="menu"
        aria-expanded={anchor != null}
        aria-label="Account"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 15 }}>
          {initials || '•'}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor != null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
          {name}
        </Typography>
        <Divider />
        <MenuItem onClick={() => void out('local')}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
        <MenuItem onClick={() => void out('global')}>
          <ListItemIcon>
            <PhonelinkEraseIcon fontSize="small" />
          </ListItemIcon>
          Sign out everywhere
        </MenuItem>
      </Menu>
    </div>
  )
}
