/// <reference types="vite/client" />

interface PovDev {
  tRef: { current: number }
  playingRef: { current: boolean }
  look: { yaw: number; pitch: number }
  gyro: {
    enabled: boolean
    listening: boolean
    targetYaw: number
    targetPitch: number
    yaw: number
    pitch: number
    needsBaseline: boolean
  }
  gyroListening: () => boolean
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
