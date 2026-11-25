import { useEffect, useState, useSyncExternalStore, type DragEvent, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { FileArchive, FolderOpen, Save, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CoachLayout } from '../app/CoachLayout'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import {
  listExportGames,
  loadExportGame,
  previewImport,
  saveImport,
  type ExportGame,
} from '../data/filmImport'
import { supabase } from '../data/supabase'
import {
  filesFromDrop,
  filesFromFolder,
  filesFromZip,
  titleFromExportName,
  type ExportFile,
} from './exportFiles'
import { formatGameDate } from './filmView'
import { readExport, type ImportPlan, type ReadExport, type ReadPlay } from './hudlImport'
import { describeRead, playStatus, playSummary, type PlayStatus } from './chartImportView'

type Stage =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string; done: number; total: number }
  | { kind: 'read'; name: string; read: ReadExport }
  | { kind: 'saving'; name: string; read: ReadExport; done: number; total: number }

interface Match {
  filmId: string | null
  title: string | null
  plan: ImportPlan
}

const FIELD =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:focus-ring dark:bg-control/30'

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/** A clip's length from a <video> element, for files without an MP4 header we can read. */
function videoDurationMs(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const src = URL.createObjectURL(blob)
    const done = (ms: number | null) => {
      URL.revokeObjectURL(src)
      resolve(ms)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () =>
      done(
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.round(video.duration * 1000)
          : null,
      )
    video.onerror = () => done(null)
    video.src = src
  })
}

/**
 * /chart: the coach opens a Hudl export (the zip or its folder). Clips are read on this
 * computer, grouped into plays and matched with the breakdown; only the game, the plays'
 * breakdown fields and each clip's fingerprint are saved. Opening the same export again
 * finds the saved game. Charting each play (#99) builds on this screen.
 */
export function ChartImportPage() {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const demo = supabase == null
  const teamId = snap.teamId
  const userId = snap.session?.user.id ?? null
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [match, setMatch] = useState<Match | null>(null)
  const [games, setGames] = useState<ExportGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [title, setTitle] = useState('')
  const [opponent, setOpponent] = useState('')
  const [gameDate, setGameDate] = useState('')

  useEffect(() => {
    startAuth()
  }, [])

  useEffect(() => {
    if (demo || teamId == null) return
    listExportGames(teamId).then(setGames, () => setGames([]))
  }, [demo, teamId, notice])

  if (!demo && snap.ready && snap.session == null) {
    return <Navigate to="/login?next=/chart" replace />
  }
  if (!demo && snap.membershipLoaded && snap.role === 'player') {
    return <Navigate to="/" replace />
  }

  async function open(load: () => Promise<{ files: ExportFile[]; name: string } | null>) {
    setError(null)
    setNotice(null)
    setMatch(null)
    let name = ''
    try {
      const picked = await load()
      if (!picked) {
        setError('Drop the export zip or its folder.')
        return
      }
      name = picked.name
      setStage({ kind: 'reading', name, done: 0, total: 0 })
      const read = await readExport(picked.files, {
        readDuration: videoDurationMs,
        onProgress: ({ done, total }) => setStage({ kind: 'reading', name, done, total }),
      })
      if (read.plays.length === 0) {
        setStage({ kind: 'idle' })
        setError('No Hudl clips found. Clips are named like "Wide - Clip 001.mp4".')
        return
      }
      setTitle(titleFromExportName(name))
      setOpponent('')
      setGameDate('')
      setStage({ kind: 'read', name, read })
      if (!demo && teamId != null) {
        const preview = await previewImport(teamId, read)
        const game = preview.filmId ? await loadExportGame(preview.filmId) : null
        setMatch({ filmId: preview.filmId, title: game?.title ?? null, plan: preview.plan })
      }
    } catch (err) {
      setStage({ kind: 'idle' })
      setError(message(err, 'Could not read that export.'))
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (stage.kind !== 'read' || teamId == null || userId == null) return
    const { name, read } = stage
    setError(null)
    setStage({ kind: 'saving', name, read, done: 0, total: 0 })
    try {
      const result = await saveImport({
        teamId,
        userId,
        read,
        details: {
          title: title.trim() || titleFromExportName(name) || 'Hudl export',
          opponent: opponent.trim() || null,
          gameDate: gameDate || null,
        },
        onProgress: (done, total) => setStage({ kind: 'saving', name, read, done, total }),
      })
      const game = await loadExportGame(result.filmId)
      const after = await previewImport(teamId, read)
      setMatch({ filmId: after.filmId, title: game.title, plan: after.plan })
      setNotice(
        result.plan.add.length === 0
          ? `${game.title}: nothing new to save.`
          : `${game.title}: saved ${result.plan.add.length} plays.`,
      )
      setStage({ kind: 'read', name, read })
    } catch (err) {
      setStage({ kind: 'read', name, read })
      setError(message(err, 'Could not save the game.'))
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void open(() => filesFromDrop(e.dataTransfer))
  }

  const busy = stage.kind === 'reading' || stage.kind === 'saving'
  const read = stage.kind === 'read' || stage.kind === 'saving' ? stage.read : null

  return (
    <CoachLayout title="Chart plays" eyebrow="Coach" account={snap.session?.user.email ?? 'Coach'}>
      <div className="grid gap-6">
        {demo ? (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Example mode. Open an export to see its plays; connect a backend and sign in as a coach
            to save them.
          </p>
        ) : null}

        <section
          aria-label="Open a Hudl export"
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'grid gap-4 rounded-xl border border-dashed bg-card p-6 text-center',
            dragging && 'border-primary bg-primary/5',
          )}
        >
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">Open a Hudl export</h2>
            <p className="text-sm text-muted-foreground">
              Drop the zip or its folder here. The clips are read on this computer and never
              uploaded; only the breakdown and each clip&apos;s fingerprint are saved.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <label
              className={cn(
                'inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90',
                busy && 'pointer-events-none opacity-50',
              )}
            >
              <FileArchive className="size-4" /> Choose zip
              <input
                type="file"
                accept=".zip,application/zip"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const zip = e.target.files?.[0]
                  e.target.value = ''
                  if (zip)
                    void open(async () => ({ files: await filesFromZip(zip), name: zip.name }))
                }}
              />
            </label>
            <label
              className={cn(
                'inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-control bg-background px-3 text-sm font-medium hover:bg-muted',
                busy && 'pointer-events-none opacity-50',
              )}
            >
              <FolderOpen className="size-4" /> Choose folder
              <input
                type="file"
                className="sr-only"
                disabled={busy}
                {...{ webkitdirectory: '' }}
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])]
                  e.target.value = ''
                  const folder = files[0]?.webkitRelativePath.split('/')[0] ?? ''
                  if (files.length)
                    void open(async () => ({ files: filesFromFolder(files), name: folder }))
                }}
              />
            </label>
          </div>
          {stage.kind === 'reading' ? (
            <Progress
              label={`Reading ${stage.name}`}
              done={stage.done}
              total={stage.total}
              unit="clips"
            />
          ) : null}
        </section>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {read ? (
          <>
            <ReadSummary read={read} plan={match?.plan ?? null} />
            {demo ? null : match == null ? (
              <p className="text-sm text-muted-foreground">
                Checking for a saved copy of this game…
              </p>
            ) : (
              <form onSubmit={save} className="grid gap-4 rounded-xl border bg-card p-4">
                {match.filmId ? (
                  <p className="text-sm">
                    This export is already saved as{' '}
                    <span className="font-medium">{match.title}</span>. {match.plan.matched.length}{' '}
                    plays match;{' '}
                    {match.plan.add.length === 0
                      ? 'nothing new to add.'
                      : `${match.plan.add.length} new plays will be added.`}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="grid gap-1.5 sm:col-span-3">
                      <label htmlFor="chart-title" className="text-sm font-medium">
                        Game
                      </label>
                      <input
                        id="chart-title"
                        required
                        maxLength={120}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={FIELD}
                      />
                    </div>
                    <div className="grid gap-1.5 sm:col-span-2">
                      <label htmlFor="chart-opponent" className="text-sm font-medium">
                        Opponent{' '}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <input
                        id="chart-opponent"
                        maxLength={80}
                        value={opponent}
                        onChange={(e) => setOpponent(e.target.value)}
                        className={FIELD}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="chart-date" className="text-sm font-medium">
                        Date <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <input
                        id="chart-date"
                        type="date"
                        value={gameDate}
                        onChange={(e) => setGameDate(e.target.value)}
                        className={FIELD}
                      />
                    </div>
                  </div>
                )}
                {stage.kind === 'saving' ? (
                  <Progress
                    label="Saving plays"
                    done={stage.done}
                    total={stage.total}
                    unit="plays"
                  />
                ) : null}
                <div>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={
                      busy ||
                      (match.filmId != null &&
                        match.plan.add.length === 0 &&
                        !match.plan.matched.some((m) => m.newFiles.length > 0))
                    }
                  >
                    <Save />{' '}
                    {stage.kind === 'saving'
                      ? 'Saving…'
                      : match.filmId
                        ? 'Add new plays'
                        : `Save ${match.plan.add.length} plays`}
                  </Button>
                </div>
              </form>
            )}
            <PlayTable plays={read.plays} plan={match?.plan ?? null} />
          </>
        ) : null}

        {games && games.length > 0 ? (
          <section aria-labelledby="chart-games" className="grid gap-3">
            <h2 id="chart-games" className="text-base font-semibold">
              Saved games
            </h2>
            <ul className="grid gap-2">
              {games.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border bg-card px-4 py-3"
                >
                  <span className="font-medium">{g.title}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {[
                      g.opponent,
                      g.gameDate ? formatGameDate(g.gameDate) : null,
                      `${g.clipCount} plays`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              To chart a saved game, open its export again on this computer.
            </p>
          </section>
        ) : null}
      </div>
    </CoachLayout>
  )
}

function Progress({
  label,
  done,
  total,
  unit,
}: {
  label: string
  done: number
  total: number
  unit: string
}) {
  const pct = total > 0 ? (done / total) * 100 : 0
  return (
    <div className="grid gap-2 text-left">
      <p className="text-sm text-muted-foreground tabular-nums">
        {label} · {done} of {total} {unit}
      </p>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(pct)}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ReadSummary({ read, plan }: { read: ReadExport; plan: ImportPlan | null }) {
  const { headline, problems } = describeRead(read, plan)
  return (
    <section
      aria-label="What the export holds"
      className="grid gap-2 rounded-xl border bg-card p-4"
    >
      <p className="font-medium">{headline}</p>
      {problems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every clip has a breakdown row and every row has a clip.
        </p>
      ) : (
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

const STATUS_VARIANT: Record<PlayStatus, 'secondary' | 'outline' | 'destructive'> = {
  saved: 'secondary',
  new: 'outline',
  clash: 'destructive',
  unreadable: 'destructive',
}

const STATUS_LABEL: Record<PlayStatus, string> = {
  saved: 'Saved',
  new: 'New',
  clash: 'Differs from saved',
  unreadable: 'Clip unreadable',
}

function PlayTable({ plays, plan }: { plays: ReadPlay[]; plan: ImportPlan | null }) {
  return (
    <section aria-labelledby="chart-plays" className="grid gap-3">
      <h2 id="chart-plays" className="text-base font-semibold">
        Plays
      </h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Play</th>
              <th className="px-3 py-2 font-medium">Situation</th>
              <th className="px-3 py-2 font-medium">Formation</th>
              <th className="px-3 py-2 font-medium">Angles</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {plays.map((play) => {
              const status = plan ? playStatus(play, plan) : null
              const row = playSummary(play)
              return (
                <tr key={play.playNumber} className="border-t">
                  <td className="px-3 py-2 tabular-nums">{play.playNumber}</td>
                  <td className="px-3 py-2">
                    {row.situation || (
                      <span className="text-muted-foreground">No breakdown row</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{row.formation}</td>
                  <td className="px-3 py-2">{row.angles}</td>
                  <td className="px-3 py-2">
                    {status ? (
                      <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
