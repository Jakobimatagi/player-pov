import { useSyncExternalStore } from 'react'
import {
  FALLBACK_PALETTE,
  resolveThemePalette,
  type ScenePalette,
  type ThemePalette,
} from './palette'

let current: ThemePalette | null = null
const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

function refresh(): void {
  const next = resolveThemePalette()
  if (current != null && JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  listeners.forEach((listener) => listener())
}

/**
 * Re-read when the first view mounts and whenever the root element's theme can change: a
 * `data-theme` or `class` switch, or a token set inline on `<html>`.
 */
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    refresh()
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      observer = new MutationObserver(refresh)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      })
    }
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}

function snapshot(): ThemePalette {
  current ??= resolveThemePalette()
  return current
}

const serverSnapshot = () => FALLBACK_PALETTE

/** Every canvas/WebGL colour for the app's theme. The fallback palette on the server. */
export function useThemePalette(): ThemePalette {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

/** The Konva play diagram's colours. */
export function useScenePalette(): ScenePalette {
  return useThemePalette().diagram
}
