// Theme and layer order first, so component stylesheets land in the right cascade layer.
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './app/router'

const root = document.getElementById('root')
if (root == null) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
