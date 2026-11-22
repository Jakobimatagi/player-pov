import { describe, expect, it } from 'vitest'
import { effectiveFormation, type Folder } from '../src/playbook/folders'

const folder = (id: string, parentId: string | null, baseFormation?: string): Folder => ({
  id,
  name: id,
  parentId,
  kind: 'playbook',
  archived: false,
  baseFormation: baseFormation ?? null,
})

describe('base alignment', () => {
  it('uses the nearest folder with one, else null', () => {
    const tree = [folder('a', null, 'pro-rt'), folder('b', 'a'), folder('c', 'b', 'trips-rt')]
    expect(effectiveFormation(tree, 'b')).toBe('pro-rt')
    expect(effectiveFormation(tree, 'c')).toBe('trips-rt')
    expect(effectiveFormation([folder('x', null)], 'x')).toBeNull()
    expect(effectiveFormation(tree, null)).toBeNull()
  })
})
