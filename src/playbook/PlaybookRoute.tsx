import { useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'
import { CoachLayout } from '../app/CoachLayout'
import { getAuthSnap, subscribeAuth } from '../auth/session'
import { supabase } from '../data/supabase'
import { PlaybookPage } from './PlaybookPage'
import './playbookSkin.css'

/**
 * Puts the playbook screen inside the MUI app layout. The page body is restyled by
 * playbookSkin.css so PlaybookPage.tsx (being reworked on feat/playbook-folders) stays untouched.
 */
export function PlaybookRoute() {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const [params] = useSearchParams()
  const playerView =
    params.get('roster') === 'player' || (supabase != null && snap.role === 'player')
  return (
    <CoachLayout
      title="Playbook"
      subtitle={playerView ? 'Plays your coach assigned.' : 'Your plays, playbooks and folders.'}
      account={playerView ? 'Player' : (snap.session?.user.email ?? 'Coach Kim')}
      nav={!playerView}
    >
      <div className="playbook-skin">
        <PlaybookPage />
      </div>
    </CoachLayout>
  )
}
