/// <reference types="vite/client" />

interface PovDev {
  tRef: { current: number }
  playingRef: { current: boolean }
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string
    readonly VITE_SUPABASE_ANON_KEY?: string
  }

  interface Window {
    __pov?: PovDev
  }
}

export {}
