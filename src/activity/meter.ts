import type { ActivityKind } from '../data/database.types'
import type { CamMode } from '../camera/modes'

/** No input for this long and the player is idle: nothing counts. */
export const IDLE_MS = 60_000
/** How often a page sends what it has counted. */
export const FLUSH_MS = 30_000
/** How often the meter samples. */
export const TICK_MS = 1_000
/** A late timer tick (throttled tab, sleep) never adds more than this. */
export const MAX_TICK_MS = 2_000
/** record_activity clamps a call to this; the meter never sends more. */
export const MAX_SECONDS_PER_CALL = 120
/** A run that reaches the end counts as a rep only if this much of it was watched. */
export const REP_WATCHED_SHARE = 0.8
/** Fastest playback chip, so a scrub can't pass for watching. */
const MAX_RATE = 2
/** Play pressed this close to the first waypoint starts a new run. */
const START_SLACK = 0.25

/** The 3D viewer's state at one tick. */
export interface ViewerSample {
  playing: boolean
  t: number
  startT: number
  duration: number
  mode: CamMode
  /** Play player id looked through in POV; empty otherwise. */
  slot: string
}

export interface Sample {
  /** Milliseconds, any monotonic clock. */
  now: number
  visible: boolean
  lastInput: number
  /** Null on the play sheet. */
  viewer: ViewerSample | null
}

export interface ActivityKey {
  kind: ActivityKind
  slot: string
}

export interface ActivityEntry extends ActivityKey {
  seconds: number
  runsStarted: number
  runsCompleted: number
}

export function isIdle(now: number, lastInput: number): boolean {
  return now - lastInput > IDLE_MS
}

function viewerKey(viewer: ViewerSample): ActivityKey {
  return viewer.mode === 'pov'
    ? { kind: 'pov', slot: viewer.slot }
    : { kind: viewer.mode, slot: '' }
}

/**
 * What this tick's time counts toward, or null when it counts for nothing: a hidden tab,
 * an idle player, or (in the viewer) a play that isn't running. POV time is only time in
 * POV while the play runs.
 */
export function countingKey(sample: Sample): ActivityKey | null {
  if (!sample.visible || isIdle(sample.now, sample.lastInput)) return null
  if (sample.viewer == null) return { kind: 'playbook', slot: '' }
  if (!sample.viewer.playing) return null
  return viewerKey(sample.viewer)
}

interface Bucket extends ActivityKey {
  ms: number
  runsStarted: number
  runsCompleted: number
}

/**
 * Counts study time and runs between flushes. Feed it a sample every second with tick();
 * drain() hands back whole seconds per (kind, slot) and keeps the fractions.
 *
 * A run starts when play is pressed at the first waypoint. It is completed when the play
 * reaches its end having been watched (visible, active, running) for at least 80% of its
 * length, so scrubbing to the end is not a rep. A completed run in POV is a mental rep.
 */
export class ActivityMeter {
  private buckets = new Map<string, Bucket>()
  private lastTick: number | null = null
  private prevPlaying = false
  private prevT = 0
  private run: { progress: number } | null = null

  private bucket(key: ActivityKey): Bucket {
    const id = `${key.kind}|${key.slot}`
    let found = this.buckets.get(id)
    if (found == null) {
      found = { ...key, ms: 0, runsStarted: 0, runsCompleted: 0 }
      this.buckets.set(id, found)
    }
    return found
  }

  tick(sample: Sample): void {
    const dt =
      this.lastTick == null ? 0 : Math.min(Math.max(sample.now - this.lastTick, 0), MAX_TICK_MS)
    this.lastTick = sample.now
    const key = countingKey(sample)
    if (key != null && dt > 0) this.bucket(key).ms += dt
    const viewer = sample.viewer
    if (viewer == null) return

    const attentive = sample.visible && !isIdle(sample.now, sample.lastInput)
    if (viewer.playing && !this.prevPlaying && viewer.t <= viewer.startT + START_SLACK) {
      this.run = { progress: 0 }
      if (attentive) this.bucket(viewerKey(viewer)).runsStarted += 1
    } else if (this.run != null && attentive && (viewer.playing || this.prevPlaying)) {
      const moved = viewer.t - this.prevT
      this.run.progress += Math.min(Math.max(moved, 0), (dt / 1000) * MAX_RATE + 0.05)
    }

    const ended = this.prevPlaying && !viewer.playing && viewer.t >= viewer.duration - 1e-3
    if (ended && this.run != null) {
      const length = viewer.duration - viewer.startT
      if (attentive && length > 0 && this.run.progress >= REP_WATCHED_SHARE * length) {
        this.bucket(viewerKey(viewer)).runsCompleted += 1
      }
      this.run = null
    }
    this.prevPlaying = viewer.playing
    this.prevT = viewer.t
  }

  /** Whole seconds and runs counted since the last drain, at most 120 seconds per entry. */
  drain(): ActivityEntry[] {
    const out: ActivityEntry[] = []
    for (const bucket of this.buckets.values()) {
      const seconds = Math.min(Math.floor(bucket.ms / 1000), MAX_SECONDS_PER_CALL)
      if (seconds === 0 && bucket.runsStarted === 0 && bucket.runsCompleted === 0) continue
      out.push({
        kind: bucket.kind,
        slot: bucket.slot,
        seconds,
        runsStarted: bucket.runsStarted,
        runsCompleted: bucket.runsCompleted,
      })
      bucket.ms -= seconds * 1000
      bucket.runsStarted = 0
      bucket.runsCompleted = 0
    }
    return out
  }

  /** Put back entries a failed send could not deliver, so the next flush retries them. */
  restore(entries: readonly ActivityEntry[]): void {
    for (const entry of entries) {
      const bucket = this.bucket(entry)
      bucket.ms += entry.seconds * 1000
      bucket.runsStarted += entry.runsStarted
      bucket.runsCompleted += entry.runsCompleted
    }
  }

  /** A hidden tab or a pause: the next tick must not bridge the gap. */
  resetClock(): void {
    this.lastTick = null
  }
}

/** The viewer's local calendar day, yyyy-mm-dd. Rollups use the player's day, not UTC. */
export function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
