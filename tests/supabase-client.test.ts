import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { supabase } from '../src/data/supabase'

describe('supabase client', () => {
  it('uses only the anon key and stays null without env', () => {
    const src = readFileSync(new URL('../src/data/supabase.ts', import.meta.url), 'utf8')
    expect(src.toLowerCase()).not.toContain('service_role')
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(supabase).toBeNull()
  })
})
