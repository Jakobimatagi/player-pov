import type { ReactNode } from 'react'
import { Link } from 'react-router'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import DrawIcon from '@mui/icons-material/Draw'
import GroupsIcon from '@mui/icons-material/Groups'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { CoachLayout } from './CoachLayout'

interface Destination {
  to: string
  label: string
  blurb: string
  icon: ReactNode
  color: string
  tag?: string
}

function destinations(dev: boolean): Destination[] {
  const list: Destination[] = [
    {
      to: '/playbook',
      label: 'Playbook',
      blurb: 'Plays, playbooks and opponent folders',
      icon: <MenuBookIcon />,
      color: '#d7263d',
    },
    {
      to: '/team',
      label: 'Team',
      blurb: 'Roster, coaches and invites',
      icon: <GroupsIcon />,
      color: '#3fa7f5',
    },
  ]
  if (dev) {
    list.push({
      to: '/dev/editor',
      label: 'Draw a play',
      blurb: 'Chart players and routes on the draw board',
      icon: <DrawIcon />,
      color: '#f5c542',
      tag: 'Preview',
    })
  }
  return list
}

export function CoachHome({ name, dev = import.meta.env.DEV }: { name: string; dev?: boolean }) {
  return (
    <CoachLayout title="Coach home" subtitle="Pick up where you left off." account={name} dev={dev}>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        }}
      >
        {destinations(dev).map((place) => (
          <Box component="li" key={place.to}>
            <Card sx={{ height: '100%' }}>
              <CardActionArea
                component={Link}
                to={place.to}
                sx={{
                  height: '100%',
                  '&:hover .go': { transform: 'translateX(4px)', color: place.color },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', mb: 2.5 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 3,
                        display: 'grid',
                        placeItems: 'center',
                        color: place.color,
                        bgcolor: alpha(place.color, 0.14),
                      }}
                    >
                      {place.icon}
                    </Box>
                    <Box sx={{ flex: 1 }} />
                    {place.tag ? (
                      <Chip size="small" label={place.tag} color="secondary" variant="outlined" />
                    ) : null}
                  </Stack>
                  <Typography variant="h3">{place.label}</Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
                    <Typography color="text.secondary" sx={{ flex: 1 }}>
                      {place.blurb}
                    </Typography>
                    <ArrowForwardIcon
                      className="go"
                      fontSize="small"
                      sx={{ color: 'text.secondary', transition: 'all .2s' }}
                    />
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Box>
        ))}
      </Box>
    </CoachLayout>
  )
}
