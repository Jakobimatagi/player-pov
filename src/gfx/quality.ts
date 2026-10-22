/** Quality ladder. Players, the ball, markings, and the facemask are never in this set. */
export type QualityFeature = 'numbers' | 'distantNumbers' | 'routes' | 'smoothCamera'

export interface QualityTier {
  level: 0 | 1 | 2 | 3
  dpr: number
  features: ReadonlySet<QualityFeature>
}

const ALL: QualityFeature[] = ['numbers', 'distantNumbers', 'routes', 'smoothCamera']

export const QUALITY_LADDER: readonly QualityTier[] = [
  { level: 0, dpr: 1.25, features: new Set(ALL) },
  { level: 1, dpr: 1, features: new Set(ALL) },
  { level: 2, dpr: 0.85, features: new Set<QualityFeature>(['numbers', 'routes', 'smoothCamera']) },
  { level: 3, dpr: 0.75, features: new Set<QualityFeature>(['numbers']) },
]

const RING = 120
const UP_RING = 300
const KEY = 'pov.quality'
const scratch = new Float64Array(RING)

export interface QualitySampler {
  level: 0 | 1 | 2 | 3
  locked: Set<number>
  cooldownUntil: number
  warmupUntil: number
  hudAnimating: boolean
  frozen: boolean
  samples: Float64Array
  times: Float64Array
  head: number
  filled: number
  hot: Uint8Array
  hotHead: number
  hotFilled: number
  hotCount: number
  steppedUp: Set<number>
  flaps: number[][]
}

export function hasFeature(level: number, feature: QualityFeature): boolean {
  const tier = QUALITY_LADDER[level] ?? QUALITY_LADDER[3]
  if (tier == null) return false
  return tier.features.has(feature)
}

/** L2+ keeps the attached player and anyone within 15 yd. Unattached views keep every number. */
export function showNumber(level: number, attached: number, index: number, dist: number): boolean {
  if (hasFeature(level, 'distantNumbers') || attached < 0 || index === attached) return true
  return dist <= 15
}

function emptyFlaps(): number[][] {
  return [[], [], [], []]
}

export function createSampler(now = 0, level: 0 | 1 | 2 | 3 = 0): QualitySampler {
  return {
    level,
    locked: new Set(),
    cooldownUntil: 0,
    warmupUntil: now + 2000,
    hudAnimating: false,
    frozen: false,
    samples: new Float64Array(RING),
    times: new Float64Array(RING),
    head: 0,
    filled: 0,
    hot: new Uint8Array(UP_RING),
    hotHead: 0,
    hotFilled: 0,
    hotCount: 0,
    steppedUp: new Set(),
    flaps: emptyFlaps(),
  }
}

function clearWindow(state: QualitySampler): void {
  state.head = 0
  state.filled = 0
  state.hotHead = 0
  state.hotFilled = 0
  state.hotCount = 0
}

function percentile(state: QualitySampler, count: number, p: number): number {
  const n = Math.min(count, state.filled)
  for (let i = 0; i < n; i += 1) {
    const index = (state.head - 1 - i + RING) % RING
    scratch[i] = state.samples[index] ?? 0
  }
  for (let i = 1; i < n; i += 1) {
    const value = scratch[i] ?? 0
    let j = i - 1
    while (j >= 0 && (scratch[j] ?? 0) > value) {
      scratch[j + 1] = scratch[j] ?? 0
      j -= 1
    }
    scratch[j + 1] = value
  }
  const rank = Math.max(0, Math.ceil(p * n) - 1)
  return scratch[rank] ?? 0
}

function spikes(state: QualitySampler, now: number): number {
  let count = 0
  const n = state.filled
  for (let i = 0; i < n; i += 1) {
    const index = (state.head - 1 - i + RING) % RING
    if (now - (state.times[index] ?? 0) > 1000) break
    if ((state.samples[index] ?? 0) > 50) count += 1
  }
  return count
}

function remember(state: QualitySampler): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(KEY, String(state.level))
  } catch {
    /* Private mode can reject the write. The in-memory level still holds. */
  }
}

function lockFlaps(state: QualitySampler, level: number, now: number): void {
  const list = state.flaps[level]
  if (list == null) return
  list.push(now)
  const kept = list.filter((at) => now - at <= 60000)
  state.flaps[level] = kept
  if (kept.length >= 3) state.locked.add(level)
}

function changeTo(state: QualitySampler, next: 0 | 1 | 2 | 3, now: number): void {
  if (next === state.level) return
  if (next < state.level) {
    if (state.locked.has(next)) return
    if (state.hudAnimating && next < 1) return
    state.steppedUp.add(next)
  } else if (state.steppedUp.has(state.level)) {
    state.steppedUp.delete(state.level)
    lockFlaps(state, state.level, now)
  }
  state.level = next
  state.cooldownUntil = now + 2000
  clearWindow(state)
  remember(state)
}

/** Feed one frame delta in milliseconds. dt above 250 ms is ignored. */
export function noteFrame(state: QualitySampler, dt: number, now: number): 0 | 1 | 2 | 3 {
  if (state.frozen || dt > 250 || now < state.warmupUntil || now < state.cooldownUntil) {
    return state.level
  }
  state.samples[state.head] = dt
  state.times[state.head] = now
  state.head = (state.head + 1) % RING
  if (state.filled < RING) state.filled += 1

  const hot = dt > 17.5 ? 1 : 0
  if (state.hotFilled === UP_RING) {
    state.hotCount -= state.hot[state.hotHead] ?? 0
  } else state.hotFilled += 1
  state.hot[state.hotHead] = hot
  state.hotCount += hot
  state.hotHead = (state.hotHead + 1) % UP_RING

  if (spikes(state, now) >= 3) {
    if (state.level < 3) changeTo(state, (state.level + 1) as 0 | 1 | 2 | 3, now)
    return state.level
  }
  if (state.filled >= 90 && percentile(state, 90, 0.9) > 19) {
    if (state.level < 3) changeTo(state, (state.level + 1) as 0 | 1 | 2 | 3, now)
    return state.level
  }
  if (
    state.hotFilled === UP_RING &&
    state.hotCount / UP_RING < 0.02 &&
    state.filled >= 90 &&
    percentile(state, 90, 0.9) <= 17 &&
    state.level > 0
  ) {
    changeTo(state, (state.level - 1) as 0 | 1 | 2 | 3, now)
  }
  return state.level
}

export function beginWarmup(state: QualitySampler, now: number): void {
  state.warmupUntil = now + 2000
  clearWindow(state)
}

/** Context restore keeps the level and starts the warm-up. */
export function noteRecovered(state: QualitySampler, now: number): void {
  beginWarmup(state, now)
}

export function setQualityFrozen(state: QualitySampler, frozen: boolean): void {
  state.frozen = frozen
}

function storedLevel(): 0 | 1 | 2 | 3 | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = Number(sessionStorage.getItem(KEY))
    if (raw === 0 || raw === 1 || raw === 2 || raw === 3) return raw
  } catch {
    return null
  }
  return null
}

function detectedLevel(): 0 | 1 {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number }
    const memory = nav.deviceMemory ?? 8
    const cores = navigator.hardwareConcurrency ?? 8
    if (memory <= 4 || cores <= 4) return 1
  } catch {
    return 0
  }
  return 0
}

export const qualityState = createSampler(
  typeof performance === 'undefined' ? 0 : performance.now(),
  storedLevel() ?? detectedLevel(),
)

export const perfMonitor = {
  enabled: false,
  samples: new Float64Array(600),
  head: 0,
  filled: 0,
  lastLog: 0,
  pushes: 0,
  p50: 0,
  p95: 0,
}

const perfScratch = new Float64Array(600)

function publishPerf(now: number): void {
  const n = perfMonitor.filled
  for (let i = 0; i < n; i += 1) {
    const index = (perfMonitor.head - 1 - i + 600) % 600
    perfScratch[i] = perfMonitor.samples[index] ?? 0
  }
  for (let i = 1; i < n; i += 1) {
    const value = perfScratch[i] ?? 0
    let j = i - 1
    while (j >= 0 && (perfScratch[j] ?? 0) > value) {
      perfScratch[j + 1] = perfScratch[j] ?? 0
      j -= 1
    }
    perfScratch[j + 1] = value
  }
  perfMonitor.p50 = perfScratch[Math.max(0, Math.ceil(0.5 * n) - 1)] ?? 0
  perfMonitor.p95 = perfScratch[Math.max(0, Math.ceil(0.95 * n) - 1)] ?? 0
  if (now - perfMonitor.lastLog >= 10000 && n >= 30) {
    perfMonitor.lastLog = now
    console.info(
      `perf p50 ${perfMonitor.p50.toFixed(2)} ms p95 ${perfMonitor.p95.toFixed(2)} ms L${qualityState.level}`,
    )
  }
}

/** Rolling p50/p95 for `?perf=1`. Called from the clock frame, not its own subscriber. */
export function notePerfFrame(dt: number, now: number): void {
  if (!perfMonitor.enabled || dt > 250) return
  perfMonitor.samples[perfMonitor.head] = dt
  perfMonitor.head = (perfMonitor.head + 1) % 600
  if (perfMonitor.filled < 600) perfMonitor.filled += 1
  perfMonitor.pushes += 1
  if (perfMonitor.pushes % 60 === 0) publishPerf(now)
}

export const perfStats = { calls: 0, triangles: 0 }
