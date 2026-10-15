/// <reference types="vite/client" />

interface PovDev {
  tRef: { current: number }
  playingRef: { current: boolean }
}

declare global {
  interface Window {
    __pov?: PovDev
  }
}

export {}
