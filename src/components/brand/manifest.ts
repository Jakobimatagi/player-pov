// Relative, not '@/', because vite.config.ts imports this before the alias exists.
import { BRAND } from '../../lib/brand'

/**
 * The web app manifest (served as /manifest.webmanifest by the Vite config), built from BRAND so
 * a rename or new theme colour reaches the home-screen icon too. The icon files are rendered by
 * scripts/brand-assets/render.mjs.
 */
export function webManifest() {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND.themeColor,
    theme_color: BRAND.themeColor,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
