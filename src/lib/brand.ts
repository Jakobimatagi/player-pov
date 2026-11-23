/**
 * The product's name and pitch, in one place. Every user-visible mention of the product reads
 * from here (index.html is filled in at build time by the Vite config), so a rename is one edit.
 */
export const BRAND = {
  name: 'Scheme HQ',
  /** The production address. schemehq.app and the old vercel.app URLs redirect here. */
  url: 'https://www.schemehq.app',
  /** The wordmark splits the name so the second part can take the accent colour. */
  wordmark: { lead: 'Scheme', accent: 'HQ' },
  tagline: 'Install it. Learn it. Win Friday.',
  description:
    'The playbook, install and scouting HQ for high school football staffs. Draw a play once; every player learns it in 3D from their own position, and your scout packs are ready for Friday.',
  shareTitle: 'Scheme HQ: install, learn and scout your scheme',
  shareDescription:
    'Playbook, 3D player-view installs, homework and scout packs for high school football coaches and their players.',
  /** Page background behind the browser chrome on mobile; matches the dark theme's background. */
  themeColor: '#0b1220',
} as const
