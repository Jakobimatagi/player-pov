import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { loadMyDepth, type MyDepth } from '../data/depthNotes'
import { slotDisplay } from '../team/depthSlots'
import {
  formatNoteDate,
  readNotesSeen,
  spotLabel,
  unseenNotes,
  writeNotesSeen,
} from '../team/depthNotes'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: MyDepth }

/**
 * Player Home card: the player's own depth chart spots ("LT, 2nd string") and the coach
 * notes shared with them, newest first. Notes shared since their last visit are marked new.
 */
export function MyDepthCard({
  teamId,
  userId,
  now: nowProp,
  initial,
  initialSeenAt,
}: {
  teamId: string | null
  userId: string | null
  now?: Date
  /** Rendered data for tests and fixtures; skips the fetch. */
  initial?: MyDepth
  /** Last-seen time for tests and fixtures; skips localStorage. */
  initialSeenAt?: string | null
}) {
  const [now] = useState(() => nowProp ?? new Date())
  const [load, setLoad] = useState<Load>(
    initial != null ? { status: 'ready', data: initial } : { status: 'loading' },
  )
  // Read once, before this visit is recorded, so the marker shows for this visit.
  const [seenAt] = useState<string | null>(() =>
    initialSeenAt !== undefined
      ? initialSeenAt
      : teamId != null && userId != null
        ? readNotesSeen(teamId, userId)
        : null,
  )

  useEffect(() => {
    if (initial != null || teamId == null || userId == null) return
    let dead = false
    loadMyDepth(teamId)
      .then((data) => {
        if (!dead) setLoad({ status: 'ready', data })
      })
      .catch(() => {
        if (!dead) setLoad({ status: 'error' })
      })
    return () => {
      dead = true
    }
  }, [initial, teamId, userId])

  const ready = load.status === 'ready'
  useEffect(() => {
    if (ready && initialSeenAt === undefined && teamId != null && userId != null) {
      writeNotesSeen(teamId, userId)
    }
  }, [ready, initialSeenAt, teamId, userId])

  if (load.status === 'loading') return null
  if (load.status === 'error') {
    return (
      <p className="mb-4 text-sm text-muted-foreground">Couldn&apos;t load your depth chart.</p>
    )
  }
  const { spots, notes } = load.data
  const fresh = new Set(unseenNotes(notes, seenAt).map((note) => note.id))
  const newest = [...notes].sort((a, b) =>
    (b.sharedAt ?? b.createdAt).localeCompare(a.sharedAt ?? a.createdAt),
  )

  return (
    <section
      className="mb-6 min-w-0 rounded-xl border bg-card p-4"
      aria-labelledby="my-depth"
      data-testid="my-depth"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="my-depth" className="text-base font-semibold">
          My depth chart
        </h2>
        {fresh.size > 0 ? (
          <span
            className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
            data-testid="my-depth-new"
          >
            {fresh.size} new {fresh.size === 1 ? 'note' : 'notes'}
          </span>
        ) : null}
      </div>
      {spots.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&apos;re not on the depth chart yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Your positions">
          {spots.map((spot) => (
            <li
              key={spot.slot}
              className="rounded-lg border bg-background px-3 py-1.5 text-sm font-semibold"
            >
              {spotLabel(spot)}
              {spot.depth > 1 ? (
                <span className="ml-1 font-normal text-muted-foreground">of {spot.depth}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-4 mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquareText className="size-4 text-muted-foreground" />
        Notes from your coaches
      </h3>
      {newest.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ol className="grid gap-2">
          {newest.map((note) => (
            <li
              key={note.id}
              className="min-w-0 rounded-lg border bg-background p-3"
              data-new={fresh.has(note.id)}
            >
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{note.authorName}</span>
                <span>{formatNoteDate(note.sharedAt ?? note.createdAt, now)}</span>
                {note.slot != null ? (
                  <span className="rounded bg-secondary px-1.5 text-foreground">
                    {slotDisplay(note.slot)}
                  </span>
                ) : null}
                {fresh.has(note.id) ? (
                  <span className="font-semibold text-primary">New</span>
                ) : null}
              </p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{note.body}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Your coaches choose which notes to share with you. Teammates can&apos;t see your spot or
        notes here.
      </p>
    </section>
  )
}
