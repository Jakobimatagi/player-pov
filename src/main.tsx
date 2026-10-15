import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './app/router'
import './index.css'

const root = document.getElementById('root')
if (root == null) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
