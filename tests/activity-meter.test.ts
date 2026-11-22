import { describe, expect, it } from 'vitest'
import {
  ActivityMeter,
  countingKey,
  IDLE_MS,
  localDay,
  MAX_SECONDS_PER_CALL,
  type Sample,
  type ViewerSample,
} from '../src/activity/meter'

const viewer = (over: Partial<ViewerSample> = {}): ViewerSample => ({
  playing: true,
  t: 0,
  startT: 0,
  duration: 10,
  mode: 'pov',
  slot: 'qb',
  ...over,
})

const sample = (over: Partial<Sample> = {}): Sample => ({
  now: 0,
  visible: true,
  lastInput: 0,
  viewer: null,
  ...over,
})

/** Tick once a second from `from` to `to` (inclusive), deriving each sample from `at`. */
function run(meter: ActivityMeter, from: number, to: number, at: (second: number) => Sample) {
  for (let s = from; s <= to; s += 1) meter.tick(at(s))
}

describe('countingKey', () => {
  it('counts play sheet time while visible and active', () => {
    expect(countingKey(sample({ now: 5_000 }))).toEqual({ kind: 'playbook', slot: '' })
  })

  it('counts nothing in a hidden tab', () => {
    expect(countingKey(sample({ visible: false }))).toBeNull()
    expect(countingKey(sample({ visible: false, viewer: viewer() }))).toBeNull()
  })

  it('counts nothing after 60 seconds without input', () => {
    expect(countingKey(sample({ now: IDLE_MS }))).not.toBeNull()
    expect(countingKey(sample({ now: IDLE_MS + 1 }))).toBeNull()
    expect(countingKey(sample({ now: IDLE_MS + 1, viewer: viewer() }))).toBeNull()
  })

  it('counts POV only while the play runs, under the watched slot', () => {
    expect(countingKey(sample({ viewer: viewer() }))).toEqual({ kind: 'pov', slot: 'qb' })
    expect(countingKey(sample({ viewer: viewer({ playing: false }) }))).toBeNull()
  })

  it('counts broadcast and top-down as their own kinds, with no slot', () => {
    expect(countingKey(sample({ viewer: viewer({ mode: 'broadcast' }) }))).toEqual({
      kind: 'broadcast',
      slot: '',
    })
    expect(countingKey(sample({ viewer: viewer({ mode: 'topdown' }) }))).toEqual({
      kind: 'topdown',
      slot: '',
    })
  })
})

describe('ActivityMeter time', () => {
  it('rolls play sheet time into whole seconds and keeps the fraction', () => {
    const meter = new ActivityMeter()
    meter.tick(sample({ now: 0 }))
    meter.tick(sample({ now: 1_500 }))
    meter.tick(sample({ now: 2_700 }))
    expect(meter.drain()).toEqual([
      { kind: 'playbook', slot: '', seconds: 2, runsStarted: 0, runsCompleted: 0 },
    ])
    meter.tick(sample({ now: 3_000 }))
    expect(meter.drain()).toEqual([
      { kind: 'playbook', slot: '', seconds: 1, runsStarted: 0, runsCompleted: 0 },
    ])
  })

  it('adds no time for a background tab', () => {
    const meter = new ActivityMeter()
    run(meter, 0, 30, (s) => sample({ now: s * 1000, visible: false }))
    expect(meter.drain()).toEqual([])
  })

  it('adds no time for an idle player, and resumes on input', () => {
    const meter = new ActivityMeter()
    run(meter, 0, 120, (s) => sample({ now: s * 1000, lastInput: 0 }))
    // Seconds 1..60 count; 61..120 are idle.
    expect(meter.drain()[0]?.seconds).toBe(60)
    run(meter, 121, 130, (s) => sample({ now: s * 1000, lastInput: 121_000 }))
    expect(meter.drain()[0]?.seconds).toBe(10)
  })

  it('adds no POV time while the play is paused', () => {
    const meter = new ActivityMeter()
    run(meter, 0, 20, (s) => sample({ now: s * 1000, viewer: viewer({ playing: false, t: 3 }) }))
    expect(meter.drain()).toEqual([])
  })

  it('splits time by camera and watched slot', () => {
    const meter = new ActivityMeter()
    run(meter, 0, 4, (s) => sample({ now: s * 1000, viewer: viewer({ t: 0.5 + s * 0.1 }) }))
    run(meter, 5, 7, (s) =>
      sample({ now: s * 1000, viewer: viewer({ t: 1 + s * 0.1, slot: 'x' }) }),
    )
    run(meter, 8, 9, (s) =>
      sample({ now: s * 1000, viewer: viewer({ t: 2 + s * 0.1, mode: 'broadcast' }) }),
    )
    const out = meter.drain()
    expect(out.find((e) => e.kind === 'pov' && e.slot === 'qb')?.seconds).toBe(4)
    expect(out.find((e) => e.kind === 'pov' && e.slot === 'x')?.seconds).toBe(3)
    expect(out.find((e) => e.kind === 'broadcast')?.seconds).toBe(2)
  })

  it('never bridges a long gap between ticks', () => {
    const meter = new ActivityMeter()
    meter.tick(sample({ now: 0 }))
    meter.tick(sample({ now: 50_000, lastInput: 50_000 }))
    expect(meter.drain()[0]?.seconds).toBe(2)
  })

  it('starts fresh after resetClock', () => {
    const meter = new ActivityMeter()
    meter.tick(sample({ now: 0 }))
    meter.resetClock()
    meter.tick(sample({ now: 1_900 }))
    expect(meter.drain()).toEqual([])
  })

  it('sends at most 120 seconds per entry and carries the rest', () => {
    const meter = new ActivityMeter()
    run(meter, 0, 200, (s) => sample({ now: s * 1000, lastInput: s * 1000 }))
    expect(meter.drain()[0]?.seconds).toBe(MAX_SECONDS_PER_CALL)
    expect(meter.drain()[0]?.seconds).toBe(80)
  })

  it('restores entries a failed send could not deliver', () => {
    const meter = new ActivityMeter()
    run(meter, 0, 5, (s) => sample({ now: s * 1000 }))
    const first = meter.drain()
    meter.restore(first)
    expect(meter.drain()).toEqual(first)
  })
})

describe('ActivityMeter reps', () => {
  /** Watch a 10s play at 1x from the first waypoint to the end. */
  function watchToEnd(meter: ActivityMeter, over: Partial<ViewerSample> = {}, offset = 0) {
    meter.tick(
      sample({ now: offset, lastInput: offset, viewer: viewer({ playing: false, ...over }) }),
    )
    run(meter, 1, 10, (s) =>
      sample({
        now: offset + s * 1000,
        lastInput: offset,
        viewer: viewer({ t: s - 1, ...over }),
      }),
    )
    meter.tick(
      sample({
        now: offset + 11_000,
        lastInput: offset,
        viewer: viewer({ t: 10, playing: false, ...over }),
      }),
    )
  }

  it('counts a run watched in POV to the end as a started and completed rep', () => {
    const meter = new ActivityMeter()
    watchToEnd(meter)
    const pov = meter.drain().find((e) => e.kind === 'pov')
    expect(pov).toMatchObject({ slot: 'qb', runsStarted: 1, runsCompleted: 1 })
    expect(pov?.seconds).toBe(10)
  })

  it('credits the run to the camera it ended in', () => {
    const meter = new ActivityMeter()
    watchToEnd(meter, { mode: 'broadcast', slot: '' })
    const out = meter.drain()
    expect(out.find((e) => e.kind === 'broadcast')).toMatchObject({ runsCompleted: 1 })
    expect(out.find((e) => e.kind === 'pov')).toBeUndefined()
  })

  it('does not count a run that was scrubbed to the end', () => {
    const meter = new ActivityMeter()
    meter.tick(sample({ now: 0, viewer: viewer({ playing: false }) }))
    meter.tick(sample({ now: 1000, viewer: viewer({ t: 0 }) }))
    meter.tick(sample({ now: 2000, viewer: viewer({ t: 9.5 }) }))
    meter.tick(sample({ now: 3000, viewer: viewer({ t: 10, playing: false }) }))
    const pov = meter.drain().find((e) => e.kind === 'pov')
    expect(pov).toMatchObject({ runsStarted: 1, runsCompleted: 0 })
  })

  it('does not count a run that ended while the tab was hidden', () => {
    const meter = new ActivityMeter()
    meter.tick(sample({ now: 0, viewer: viewer({ playing: false }) }))
    run(meter, 1, 10, (s) =>
      sample({ now: s * 1000, visible: s < 3, viewer: viewer({ t: s - 1 }) }),
    )
    meter.tick(sample({ now: 11_000, visible: false, viewer: viewer({ t: 10, playing: false }) }))
    expect(meter.drain().find((e) => e.kind === 'pov')?.runsCompleted).toBe(0)
  })

  it('keeps a paused run open and completes it on resume', () => {
    const meter = new ActivityMeter()
    meter.tick(sample({ now: 0, viewer: viewer({ playing: false }) }))
    run(meter, 1, 5, (s) => sample({ now: s * 1000, viewer: viewer({ t: s - 1 }) }))
    run(meter, 6, 20, (s) => sample({ now: s * 1000, viewer: viewer({ t: 4, playing: false }) }))
    run(meter, 21, 27, (s) =>
      sample({ now: s * 1000, lastInput: 21_000, viewer: viewer({ t: s - 17 }) }),
    )
    meter.tick(
      sample({ now: 28_000, lastInput: 21_000, viewer: viewer({ t: 10, playing: false }) }),
    )
    const pov = meter.drain().find((e) => e.kind === 'pov')
    expect(pov).toMatchObject({ runsStarted: 1, runsCompleted: 1 })
  })

  it('counts a replay as a second run', () => {
    const meter = new ActivityMeter()
    watchToEnd(meter)
    watchToEnd(meter, {}, 20_000)
    expect(meter.drain().find((e) => e.kind === 'pov')).toMatchObject({
      runsStarted: 2,
      runsCompleted: 2,
    })
  })
})

describe('localDay', () => {
  it('formats the local calendar day', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
