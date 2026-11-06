import type { ReactNode } from 'react'
import { Link } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import MuiLink from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { BrandMark } from '../app/CoachLayout'

/** Lined turf behind the sign-in screens: yard lines and hash marks, nothing else. */
function TurfPanel() {
  return (
    <Box
      aria-hidden
      sx={{
        display: { xs: 'none', md: 'flex' },
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        p: 6,
        background: 'repeating-linear-gradient(90deg, #1f5a2c 0 60px, #22632f 60px 120px)',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent 0 59px, rgba(255,255,255,0.35) 59px 61px), repeating-linear-gradient(0deg, transparent 0 46%, rgba(255,255,255,0.45) 46% 46.4%, transparent 46.4% 53.6%, rgba(255,255,255,0.45) 53.6% 54%, transparent 54% 100%)',
          opacity: 0.6,
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${alpha('#0e1116', 0.1)} 0%, ${alpha('#0e1116', 0.92)} 85%)`,
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>
        <Typography variant="overline" sx={{ color: 'secondary.main' }}>
          See it from the helmet
        </Typography>
        <Typography component="p" variant="h1" sx={{ fontSize: '2.6rem', mt: 1, lineHeight: 1.1 }}>
          Every play, from every player&apos;s eyes.
        </Typography>
        <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.75)' }}>
          Chart it once. Your players rep it in 3D before they ever step on the field.
        </Typography>
      </Box>
    </Box>
  )
}

export function AuthScreen({
  children,
  title,
  hint,
  banner,
}: {
  children: ReactNode
  title?: string
  hint?: string
  banner?: string
}) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <TurfPanel />
      <Stack
        sx={{
          width: { xs: '100%', md: 520 },
          flexShrink: 0,
          px: { xs: 2, sm: 4 },
          py: { xs: 4, sm: 6 },
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          <Box sx={{ mb: 4 }}>
            <BrandMark size="lg" />
          </Box>
          {banner ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              {banner}
            </Alert>
          ) : null}
          <Card data-testid="auth-card">
            <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
              {title ? (
                <Typography variant="h2" component="h1" sx={{ mb: 3 }}>
                  {title}
                </Typography>
              ) : null}
              {children}
            </CardContent>
          </Card>
          {hint ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 2.5, textAlign: 'center' }}
            >
              {hint}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Box>
  )
}

/** A router link styled as an MUI text link. */
export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <MuiLink component={Link} to={to} underline="hover" sx={{ fontWeight: 600 }}>
      {children}
    </MuiLink>
  )
}
