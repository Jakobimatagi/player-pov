import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newScript } from '../src/diagram/script'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('../src/data/supabase', () => ({ supabase: { from: mocks.from } }))

import { loadRemoteScript, saveRemoteScript, ScriptConflictError } from '../src/data/diagrams'

type Result = { data: unknown; error: { message: string; code?: string } | null }

/** A query builder that records its calls and resolves to `result`. */
function table(result: Result) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'insert', 'update', 'eq']) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, args])
      return builder
    }
  }
  builder.maybeSingle = () => Promise.resolve(result)
  builder.then = (ok: (value: Result) => unknown, bad?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(ok, bad)
  return { builder, calls }
}

beforeEach(() => mocks.from.mockReset())

describe('loadRemoteScript', () => {
  it('returns the script and its version', async () => {
    const script = newScript()
    mocks.from.mockReturnValue(table({ data: { script, version: 4 }, error: null }).builder)
    expect(await loadRemoteScript('book')).toEqual({ script, version: 4 })
    expect(mocks.from).toHaveBeenCalledWith('playbook_scripts')
  })

  it('returns null for no row and for an unreadable one', async () => {
    mocks.from.mockReturnValue(table({ data: null, error: null }).builder)
    expect(await loadRemoteScript('book')).toBeNull()
    mocks.from.mockReturnValue(
      table({ data: { script: { plays: [] }, version: 1 }, error: null }).builder,
    )
    expect(await loadRemoteScript('book')).toBeNull()
  })

  it('throws the database error', async () => {
    mocks.from.mockReturnValue(table({ data: null, error: { message: 'boom' } }).builder)
    await expect(loadRemoteScript('book')).rejects.toThrow('boom')
  })
})

describe('saveRemoteScript', () => {
  it('inserts the first save and returns version 1', async () => {
    const t = table({ data: { version: 1 }, error: null })
    mocks.from.mockReturnValue(t.builder)
    expect(await saveRemoteScript('book', newScript(), null)).toBe(1)
    expect(t.calls.map(([name]) => name)).toContain('insert')
  })

  it('updates only the version it loaded and returns the next one', async () => {
    const t = table({ data: [{ version: 5 }], error: null })
    mocks.from.mockReturnValue(t.builder)
    expect(await saveRemoteScript('book', newScript(), 4)).toBe(5)
    expect(t.calls).toContainEqual(['eq', ['version', 4]])
  })

  it('reports a conflict when nothing matched the version, or the row already exists', async () => {
    mocks.from.mockReturnValue(table({ data: [], error: null }).builder)
    await expect(saveRemoteScript('book', newScript(), 4)).rejects.toBeInstanceOf(
      ScriptConflictError,
    )
    mocks.from.mockReturnValue(
      table({ data: null, error: { message: 'dup', code: '23505' } }).builder,
    )
    await expect(saveRemoteScript('book', newScript(), null)).rejects.toBeInstanceOf(
      ScriptConflictError,
    )
  })

  it('surfaces other errors as plain errors', async () => {
    mocks.from.mockReturnValue(table({ data: null, error: { message: 'offline' } }).builder)
    await expect(saveRemoteScript('book', newScript(), null)).rejects.toThrow('offline')
    await expect(saveRemoteScript('book', newScript(), null)).rejects.not.toBeInstanceOf(
      ScriptConflictError,
    )
  })
})
