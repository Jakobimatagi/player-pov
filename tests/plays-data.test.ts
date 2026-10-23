import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COVER_2_LOOK } from '../src/play/cover2Look'
import type { PlaySource } from '../src/play/sourceTypes'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../src/data/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))

import {
  deletePlay,
  isVersionConflict,
  listPlays,
  renamePlay,
  savePlay,
  StaleVersionError,
} from '../src/data/plays'

const flood = {
  id: 'flood',
  team_id: 'team-a',
  name: 'Flood',
  side: 'offense',
  current_version: 2,
  default_look_id: null,
  updated_at: '2026-10-23T00:00:00.000Z',
}

function table(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const builder = {
    select: () => builder,
    update: () => builder,
    insert: () => builder,
    eq: () => builder,
    is: () => builder,
    in: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return builder
}

describe('play data', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.from.mockReset()
  })

  it('treats P0409 and 409 as a version conflict', () => {
    expect(isVersionConflict({ code: 'P0409', message: 'version conflict' })).toBe(true)
    expect(isVersionConflict({ code: '409', message: '' })).toBe(true)
    expect(isVersionConflict({ message: 'version conflict' })).toBe(true)
    expect(isVersionConflict({ code: '42501', message: 'forbidden' })).toBe(false)
  })

  it('lists plays for a team', async () => {
    mocks.from.mockImplementation((name: string) => {
      if (name === 'playbook_plays') return table({ data: [{ play_id: 'flood' }], error: null })
      return table({ data: [flood], error: null })
    })
    const rows = await listPlays('team-a', 'pb1')
    expect(rows.map((row) => row.name)).toEqual(['Flood'])
  })

  it('renames and archives through the anon client', async () => {
    mocks.from.mockImplementation(() => table({ data: [{ id: 'flood' }], error: null }))
    await renamePlay('flood', 'Flood Left')
    await deletePlay('flood')
    const updates = mocks.from.mock.results.map((call) => call.type)
    expect(updates).toHaveLength(2)
  })

  it('throws StaleVersionError with the current version', async () => {
    const source = JSON.parse(
      readFileSync('fixtures/trips-flood.source.json', 'utf8'),
    ) as PlaySource
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0409', message: 'version conflict' },
    })
    mocks.from.mockImplementation(() => table({ data: { current_version: 4 }, error: null }))
    const error = await savePlay({
      teamId: 'team-a',
      playId: 'flood',
      expectedVersion: 1,
      name: 'Flood',
      source,
      look: { id: null, expectedVersion: null, source: COVER_2_LOOK },
    }).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(StaleVersionError)
    expect(error).toMatchObject({ current: 4 })
  })
})
