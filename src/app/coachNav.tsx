import type { ReactNode } from 'react'
import DrawIcon from '@mui/icons-material/Draw'
import GroupsIcon from '@mui/icons-material/Groups'
import HomeIcon from '@mui/icons-material/Home'
import MenuBookIcon from '@mui/icons-material/MenuBook'

export interface NavItem {
  to: string
  label: string
  /** Bottom-bar label on phones, when `label` is too long. */
  short?: string
  icon: ReactNode
}

/** Only places that exist. The draw board is a dev preview until C7 adds /plays/new. */
export function coachNav(dev: boolean = import.meta.env.DEV): NavItem[] {
  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: <HomeIcon /> },
    { to: '/playbook', label: 'Playbook', icon: <MenuBookIcon /> },
    { to: '/team', label: 'Team', icon: <GroupsIcon /> },
  ]
  if (dev)
    items.push({ to: '/dev/editor', label: 'Draw a play', short: 'Draw', icon: <DrawIcon /> })
  return items
}
