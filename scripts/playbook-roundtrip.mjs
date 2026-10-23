import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const status = execSync('supabase status -o env', { encoding: 'utf8' })
const value = (name) => {
  const line = status.split('\n').find((item) => item.startsWith(`${name}=`))
  if (line == null) throw new Error(`missing ${name}`)
  return line.slice(name.length + 1).replace(/^"|"$/g, '')
}

process.env.VITE_SUPABASE_URL = value('API_URL')
process.env.VITE_SUPABASE_ANON_KEY = value('ANON_KEY')

const teamId = '00000000-0000-4000-8000-0000000000a1'
const { supabase } = await import('../src/data/supabase.ts')
if (supabase == null) throw new Error('supabase client is null')

const signedIn = await supabase.auth.signInWithPassword({
  email: 'coach@demo.local',
  password: 'password1234',
})
if (signedIn.error) throw signedIn.error

const { COVER_2_LOOK } = await import('../src/play/cover2Look.ts')
const source = JSON.parse(readFileSync('fixtures/trips-flood.source.json', 'utf8'))
const { addToPlaybook, deletePlay, listPlays, renamePlay, savePlay, StaleVersionError } =
  await import('../src/data/plays.ts')

const saved = await savePlay({
  teamId,
  playId: null,
  expectedVersion: null,
  name: 'Flood',
  source,
  look: { id: null, expectedVersion: null, source: COVER_2_LOOK },
})
const book = await supabase
  .from('playbooks')
  .insert({ team_id: teamId, name: `PB ${saved.playId.slice(0, 8)}` })
  .select('id')
  .single()
if (book.error || book.data == null) throw book.error ?? new Error('playbook insert failed')
await addToPlaybook(book.data.id, saved.playId, 1)
await supabase.from('assignments').insert({
  team_id: teamId,
  playbook_id: book.data.id,
  assignee_group: 'QB',
})

const listed = await listPlays(teamId, book.data.id)
if (!listed.some((play) => play.id === saved.playId && play.name === 'Flood')) {
  throw new Error('list missed Flood')
}
await renamePlay(saved.playId, 'Flood Left')
const renamed = await listPlays(teamId)
if (!renamed.some((play) => play.id === saved.playId && play.name === 'Flood Left')) {
  throw new Error('rename did not stick')
}

const stale = await savePlay({
  teamId,
  playId: saved.playId,
  expectedVersion: 0,
  name: 'Flood Left',
  source,
  look: { id: saved.lookId, expectedVersion: saved.lookVersion, source: COVER_2_LOOK },
}).then(
  () => null,
  (error) => error,
)
if (!(stale instanceof StaleVersionError) || stale.current !== saved.version) {
  throw new Error(`expected StaleVersionError current ${saved.version}, got ${stale}`)
}

await supabase.auth.signOut()
const player = await supabase.auth.signInWithPassword({
  email: 'player@demo.local',
  password: 'password1234',
})
if (player.error) throw player.error
const asPlayer = await listPlays(teamId)
if (!asPlayer.some((play) => play.id === saved.playId)) throw new Error('player cannot see Flood')
const denied = await renamePlay(saved.playId, 'Hacked').then(
  () => null,
  (error) => error,
)
if (!(denied instanceof Error) || denied.message !== 'forbidden') {
  throw new Error(`player rename should be forbidden, got ${denied}`)
}

await supabase.auth.signOut()
const coach = await supabase.auth.signInWithPassword({
  email: 'coach@demo.local',
  password: 'password1234',
})
if (coach.error) throw coach.error
await deletePlay(saved.playId)
const after = await listPlays(teamId)
if (after.some((play) => play.id === saved.playId)) throw new Error('archived play is still listed')
console.log('playbook round-trip ok', saved.playId)
