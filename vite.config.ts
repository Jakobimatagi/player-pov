import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { BRAND } from './src/lib/brand'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Fills the %BRAND_*% placeholders in index.html from the brand setting. */
function brandHtml(): Plugin {
  const values: Record<string, string> = {
    BRAND_NAME: BRAND.name,
    BRAND_TAGLINE: BRAND.tagline,
    BRAND_DESCRIPTION: BRAND.description,
    BRAND_SHARE_TITLE: BRAND.shareTitle,
    BRAND_SHARE_DESCRIPTION: BRAND.shareDescription,
    BRAND_THEME_COLOR: BRAND.themeColor,
  }
  return {
    name: 'brand-html',
    transformIndexHtml: (html) =>
      html.replace(/%(BRAND_[A-Z_]+)%/g, (match, key: string) => {
        const value = values[key]
        return value === undefined ? match : escapeHtml(value)
      }),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), brandHtml()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    execArgv: ['--expose-gc'],
  },
})
