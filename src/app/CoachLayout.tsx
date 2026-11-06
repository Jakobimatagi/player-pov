import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import AppBar from '@mui/material/AppBar'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { AccountMenu } from './AccountMenu'
import { coachNav, type NavItem } from './coachNav'

export const DRAWER_WIDTH = 248

function activeIndex(items: NavItem[], path: string): number {
  if (path === '/') return 0
  return items.findIndex((item) => item.to !== '/' && path.startsWith(item.to))
}

export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 40 : 32
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <Box
        aria-hidden
        sx={{
          width: box,
          height: box,
          borderRadius: `${Math.round(box * 0.28)}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'primary.main',
          color: '#fff',
          fontWeight: 900,
          fontSize: box * 0.34,
          letterSpacing: '-0.02em',
          boxShadow: '0 6px 18px rgba(215,38,61,0.35)',
        }}
      >
        POV
      </Box>
      <Typography
        component="span"
        sx={{ fontWeight: 800, fontSize: size === 'lg' ? '1.35rem' : '1.1rem' }}
      >
        Playbook
      </Typography>
    </Stack>
  )
}

export interface CoachLayoutProps {
  title: string
  subtitle?: string
  /** Buttons shown next to the title. */
  actions?: ReactNode
  account: string
  /** Players get no coach navigation. */
  nav?: boolean
  /** Dev builds also link the draw board preview. */
  dev?: boolean
  children: ReactNode
}

/** App chrome for signed-in pages: drawer from tablet up, bottom navigation on phones. */
export function CoachLayout({
  title,
  subtitle,
  actions,
  account,
  nav = true,
  dev = import.meta.env.DEV,
  children,
}: CoachLayoutProps) {
  const location = useLocation()
  const items = coachNav(dev)
  const current = activeIndex(items, location.pathname)

  return (
    <Box className="coach-layout" sx={{ display: 'flex', minHeight: '100%', width: '100%' }}>
      {nav ? (
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          <Toolbar sx={{ px: 2.5, minHeight: 72 }}>
            <BrandMark />
          </Toolbar>
          <List component="nav" aria-label="Coach" sx={{ pt: 1 }}>
            {items.map((item, index) => (
              <ListItemButton
                key={item.to}
                component={Link}
                to={item.to}
                selected={index === current}
                aria-current={index === current ? 'page' : undefined}
                sx={{ mb: 0.5 }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      ) : null}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" elevation={0} color="transparent">
          <Toolbar sx={{ gap: 2, minHeight: { xs: 64, md: 72 } }}>
            <Box sx={{ display: { xs: 'block', md: nav ? 'none' : 'block' } }}>
              <BrandMark />
            </Box>
            <Box sx={{ flex: 1 }} />
            <AccountMenu name={account} />
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          sx={{
            flex: 1,
            width: '100%',
            maxWidth: 1200,
            mx: 'auto',
            px: { xs: 2, sm: 3, md: 4 },
            pt: { xs: 2, md: 3 },
            pb: { xs: nav ? 12 : 4, md: 6 },
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' }, mb: 3 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h1">{title}</Typography>
              {subtitle ? (
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {subtitle}
                </Typography>
              ) : null}
            </Box>
            {actions ? (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                {actions}
              </Stack>
            ) : null}
          </Stack>
          {children}
        </Box>
      </Box>

      {nav ? (
        <BottomNavigation
          component="nav"
          aria-label="Coach"
          showLabels
          value={current}
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (t) => t.zIndex.appBar,
          }}
        >
          {items.map((item) => (
            <BottomNavigationAction
              key={item.to}
              component={Link}
              to={item.to}
              label={item.short ?? item.label}
              icon={item.icon}
            />
          ))}
        </BottomNavigation>
      ) : null}
    </Box>
  )
}
