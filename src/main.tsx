// Theme and layer order first, so component stylesheets land in the right cascade layer.
import './index.css'
import { createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { showLanding, storageKeys } from './landing/gate'

const root = document.getElementById('root')
if (root == null) throw new Error('Missing #root')

// Visitors get the landing page without downloading the app and its 3D bundle.
const landing = showLanding({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
  backend: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
  storageKeys: storageKeys(),
})

const page = landing
  ? (await import('./landing/LandingPage')).LandingPage
  : (await import('./app/router')).AppRouter

createRoot(root).render(<StrictMode>{createElement(page)}</StrictMode>)
