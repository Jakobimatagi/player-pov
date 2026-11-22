import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newScript, type DiagramScript } from '../src/diagram/script'
import { createSaver, RETRY_MS, SAVE_DELAY_MS, type SaveStatus } from '../src/diagram/saver'

class Conflict extends Error {}

function setup(options: { script?: DiagramScript | null; version?: number | null } = {}) {
  const statuses: SaveStatus[] = []
  const save = vi.fn<(s: DiagramScript, v: number | null) => Promise<number>>()
  save.mockImplementation((_s, v) => Promise.resolve((v ?? 0) + 1))
  const base = options.script === undefined ? newScript() : options.script
  const saver = createSaver({
    save,
    isConflict: (e) => e instanceof Conflict,
    onStatus: (s) => statuses.push(s),
    loaded: { version: options.version ?? null, script: base },
  })
  const edit = (): DiagramScript => ({ ...newScript(), index: 0, plays: [...newScript().plays] })
  return { saver, save, statuses, base, edit }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createSaver', () => {
  it('writes nothing for the script it loaded', async () => {
    const t = setup()
    if (t.base != null) t.saver.update(t.base)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3)
    expect(t.save).not.toHaveBeenCalled()
  })

  it('waits for edits to settle, then saves the last one once', async () => {
    const t = setup({ version: 3 })
    const a = t.edit()
    const b = t.edit()
    t.saver.update(a)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 100)
    t.saver.update(b)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 100)
    expect(t.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(t.save).toHaveBeenCalledTimes(1)
    expect(t.save).toHaveBeenCalledWith(b, 3)
    expect(t.statuses).toEqual(['saving', 'saved'])
  })

  it('sends an edit made during a save right after it, with the new version', async () => {
    const t = setup({ version: 1 })
    let release: (v: number) => void = () => {}
    t.save.mockImplementationOnce(() => new Promise<number>((r) => (release = r)))
    const a = t.edit()
    const b = t.edit()
    t.saver.update(a)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    t.saver.update(b)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2)
    expect(t.save).toHaveBeenCalledTimes(1)
    release(2)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(t.save).toHaveBeenCalledTimes(2)
    expect(t.save).toHaveBeenLastCalledWith(b, 2)
    expect(t.statuses.at(-1)).toBe('saved')
  })

  it('retries a failed save and then succeeds', async () => {
    const t = setup()
    t.save.mockRejectedValueOnce(new Error('offline'))
    t.saver.update(t.edit())
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(t.statuses).toEqual(['saving', 'error'])
    await vi.advanceTimersByTimeAsync(RETRY_MS)
    expect(t.save).toHaveBeenCalledTimes(2)
    expect(t.statuses.at(-1)).toBe('saved')
  })

  it('stops for good on a conflict instead of overwriting', async () => {
    const t = setup({ version: 2 })
    t.save.mockRejectedValueOnce(new Conflict())
    t.saver.update(t.edit())
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(t.statuses.at(-1)).toBe('conflict')
    t.saver.update(t.edit())
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3)
    expect(t.save).toHaveBeenCalledTimes(1)
  })

  it('pushes a device draft on the first edit when nothing is known to be saved', async () => {
    const t = setup({ script: null })
    t.saver.update(t.edit())
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(t.save).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('flush writes at once and dispose cancels a pending save', async () => {
    const t = setup()
    t.saver.update(t.edit())
    await t.saver.flush()
    expect(t.save).toHaveBeenCalledTimes(1)
    t.saver.update(t.edit())
    t.saver.dispose()
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2)
    expect(t.save).toHaveBeenCalledTimes(1)
  })
})
