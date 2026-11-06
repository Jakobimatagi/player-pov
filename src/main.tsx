import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { AppRouter } from './app/router'
import { theme } from './ui/theme'
import './index.css'

const root = document.getElementById('root')
if (root == null) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <AppRouter />
    </ThemeProvider>
  </StrictMode>,
)
