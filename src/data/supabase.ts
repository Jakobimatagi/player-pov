import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

function publicEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  const fromVite = import.meta.env?.[name]
  if (typeof fromVite === 'string' && fromVite.length > 0) return fromVite
  const fromProcess = typeof process !== 'undefined' ? process.env[name] : undefined
  return typeof fromProcess === 'string' && fromProcess.length > 0 ? fromProcess : undefined
}

const url = publicEnv('VITE_SUPABASE_URL')
const anonKey = publicEnv('VITE_SUPABASE_ANON_KEY')

/** Anon client. Null when the public env vars are unset, so the engine viewer still runs. */
export const supabase: SupabaseClient<Database> | null =
  typeof url === 'string' && url.length > 0 && typeof anonKey === 'string' && anonKey.length > 0
    ? createClient<Database>(url, anonKey, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null
