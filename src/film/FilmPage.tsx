import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import { Link, Navigate } from 'react-router'
import { Clapperboard, FolderOpen, Pause, Play, RotateCw, Trash2, Upload, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CoachLayout } from '../app/CoachLayout'
import { getAuthSnap, startAuth, subscribeAuth } from '../auth/session'
import {
  createFilm,
  deleteFilm,
  deleteLocalFilm,
  filmPlaybackUrl,
  filmUsage,
  listFilm,
  listPackWeeks,
  uploadFilm,
  type Film,
  type PackWeek,
} from '../data/film'
import { supabase } from '../data/supabase'
import {
  formatDuration,
  formatGameDate,
  packWeekLabel,
  progressLabel,
  statusLabel,
  titleFromFileName,
  usagePercent,
} from './filmView'
import { DEMO_FILMS, DEMO_USAGE } from './demoFilm'
import { FILM_VIDEO_TYPES, fileProblem, formatBytes } from './uploadPlan'

type Load =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; films: Film[]; used: number; quota: number; weeks: PackWeek[] }

interface UploadState {
  filmId: string
  title: string
  sent: number
  total: number
  phase: 'sending' | 'paused' | 'error'
  error?: string
}

const FIELD =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:focus-ring dark:bg-control/30'

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/**
 * /film: the team's game film. Coaches add a game (the file uploads in parts and resumes
 * after a dropped connection), watch it, and delete it. Storage use is shown against the
 * team's limit. Players are sent home; they reach film only through an assigned play.
 */
export function FilmPage() {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const demo = supabase == null
  const teamId = snap.teamId
  const userId = snap.session?.user.id ?? null
  const [fetched, setFetched] = useState<Load>({ status: 'loading' })
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [watching, setWatching] = useState<{ filmId: string; url: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const filesRef = useRef(new Map<string, File>())

  useEffect(() => {
    startAuth()
  }, [])

  const reload = useCallback(async () => {
    if (demo || teamId == null) return
    try {
      const [films, usage, weeks] = await Promise.all([
        listFilm(teamId),
        filmUsage(teamId),
        listPackWeeks(teamId),
      ])
      setFetched({ status: 'ready', films, used: usage.used, quota: usage.quota, weeks })
    } catch (err) {
      setFetched({ status: 'error', text: message(err, 'Could not load film') })
    }
  }, [demo, teamId])

  useEffect(() => {
    void reload()
  }, [reload])

  // Leaving mid-upload loses the in-flight parts (finished parts are kept), so ask first.
  useEffect(() => {
    if (upload?.phase !== 'sending') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [upload?.phase])

  if (!demo && snap.ready && snap.session == null) {
    return <Navigate to="/login?next=/film" replace />
  }
  if (!demo && snap.membershipLoaded && snap.role === 'player') {
    return <Navigate to="/" replace />
  }

  const load: Load = demo
    ? {
        status: 'ready',
        films: DEMO_FILMS,
        used: DEMO_USAGE.used,
        quota: DEMO_USAGE.quota,
        weeks: [],
      }
    : fetched

  async function send(film: { id: string; title: string }, file: File) {
    filesRef.current.set(film.id, file)
    const controller = new AbortController()
    abortRef.current = controller
    setNotice(null)
    setUpload({ filmId: film.id, title: film.title, sent: 0, total: file.size, phase: 'sending' })
    try {
      await uploadFilm(film.id, file, {
        signal: controller.signal,
        onProgress: (sent, total) =>
          setUpload((u) => (u && u.filmId === film.id ? { ...u, sent, total } : u)),
      })
      filesRef.current.delete(film.id)
      setUpload(null)
      setNotice(`${film.title} is ready to watch.`)
    } catch (err) {
      if (controller.signal.aborted) {
        setUpload((u) => (u ? { ...u, phase: 'paused' } : u))
      } else {
        setUpload((u) =>
          u ? { ...u, phase: 'error', error: message(err, 'The upload stopped.') } : u,
        )
      }
    } finally {
      abortRef.current = null
      void reload()
    }
  }

  async function add(input: {
    file: File
    title: string
    opponent: string
    gameDate: string
    folderId: string
  }) {
    if (teamId == null || userId == null) throw new Error('Sign in to add film.')
    const film = await createFilm({
      teamId,
      userId,
      folderId: input.folderId || null,
      title: input.title.trim(),
      opponent: input.opponent.trim() || null,
      gameDate: input.gameDate || null,
      sizeBytes: input.file.size,
    })
    await reload()
    void send(film, input.file)
  }

  function resume(film: Film, file: File | undefined) {
    if (!file) return
    if (file.size !== film.sizeBytes) {
      setNotice(`Choose the same file you started with (${formatBytes(film.sizeBytes ?? 0)}).`)
      return
    }
    void send(film, file)
  }

  async function watch(film: Film) {
    setBusyId(film.id)
    try {
      const { url } = await filmPlaybackUrl(film.id)
      setWatching({ filmId: film.id, url })
    } catch (err) {
      setNotice(message(err, 'Could not open this film.'))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(film: Film) {
    setBusyId(film.id)
    try {
      if (upload?.filmId === film.id) abortRef.current?.abort()
      if (film.source === 'hudl_export') await deleteLocalFilm(film.id)
      else await deleteFilm(film.id)
      if (watching?.filmId === film.id) setWatching(null)
      if (upload?.filmId === film.id) setUpload(null)
      setNotice(`${film.title} was deleted.`)
      await reload()
    } catch (err) {
      setNotice(message(err, 'Could not delete this film.'))
    } finally {
      setBusyId(null)
      setConfirmDelete(null)
    }
  }

  const quotaLeft = load.status === 'ready' ? Math.max(0, load.quota - load.used) : 0

  return (
    <CoachLayout title="Game film" eyebrow="Coach" account={snap.session?.user.email ?? 'Coach'}>
      <div className="grid gap-6">
        {demo ? (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Example film. Connect a backend and sign in as a coach to upload your own.
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

        {load.status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading film…</p>
        ) : load.status === 'error' ? (
          <p className="text-sm text-destructive">{load.text}</p>
        ) : (
          <>
            <StorageMeter used={load.used} quota={load.quota} />

            {upload ? (
              <UploadProgress
                upload={upload}
                onPause={() => abortRef.current?.abort()}
                onResume={() => {
                  const file = filesRef.current.get(upload.filmId)
                  if (file) void send({ id: upload.filmId, title: upload.title }, file)
                }}
              />
            ) : null}

            <AddFilmForm
              disabled={demo || upload?.phase === 'sending'}
              quotaLeft={quotaLeft}
              weeks={load.weeks}
              onAdd={add}
            />

            <section aria-labelledby="film-list" className="grid gap-3">
              <h2 id="film-list" className="text-base font-semibold">
                Team film
              </h2>
              {load.films.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No film yet. Add your first game above.
                </p>
              ) : (
                <ul className="grid gap-3">
                  {load.films.map((film) => (
                    <FilmRow
                      key={film.id}
                      film={film}
                      demo={demo}
                      week={load.weeks.find((w) => w.id === film.folderId) ?? null}
                      uploadingNow={upload?.filmId === film.id && upload.phase === 'sending'}
                      busy={busyId === film.id}
                      confirming={confirmDelete === film.id}
                      watchingUrl={watching?.filmId === film.id ? watching.url : null}
                      onWatch={() => void watch(film)}
                      onClose={() => setWatching(null)}
                      onResume={(file) => resume(film, file)}
                      onAskDelete={() => setConfirmDelete(film.id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onDelete={() => void remove(film)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </CoachLayout>
  )
}

function StorageMeter({ used, quota }: { used: number; quota: number }) {
  const pct = usagePercent(used, quota)
  return (
    <section aria-label="Film storage" className="grid gap-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Team film storage</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatBytes(used)} of {formatBytes(quota)} used
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className={cn('h-full rounded-full bg-primary', pct >= 90 && 'bg-destructive')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Export at 720p (about 1 GB an hour) and delete opponent film after the game to stay within
        the limit.
      </p>
    </section>
  )
}

function UploadProgress({
  upload,
  onPause,
  onResume,
}: {
  upload: UploadState
  onPause: () => void
  onResume: () => void
}) {
  const pct = upload.total > 0 ? (upload.sent / upload.total) * 100 : 0
  return (
    <section aria-label="Upload" className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{upload.title}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {upload.phase === 'paused'
              ? `Paused · ${progressLabel(upload.sent, upload.total)}`
              : upload.phase === 'error'
                ? (upload.error ?? 'The upload stopped.')
                : `Uploading · ${progressLabel(upload.sent, upload.total)}`}
          </p>
        </div>
        {upload.phase === 'sending' ? (
          <Button variant="outline" size="lg" onClick={onPause}>
            <Pause /> Pause
          </Button>
        ) : (
          <Button size="lg" onClick={onResume}>
            <RotateCw /> {upload.phase === 'error' ? 'Try again' : 'Resume'}
          </Button>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(pct)}
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width]',
            upload.phase === 'error' && 'bg-destructive',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Finished parts are saved. If the connection drops or the page closes, open Game film again
        and choose the same file to pick up where it stopped.
      </p>
    </section>
  )
}

function AddFilmForm({
  disabled,
  quotaLeft,
  weeks,
  onAdd,
}: {
  disabled: boolean
  quotaLeft: number
  weeks: PackWeek[]
  onAdd: (input: {
    file: File
    title: string
    opponent: string
    gameDate: string
    folderId: string
  }) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [opponent, setOpponent] = useState('')
  const [gameDate, setGameDate] = useState('')
  const [folderId, setFolderId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [inputKey, setInputKey] = useState(0)

  function pick(next: File | null) {
    setFile(next)
    setError(next ? fileProblem(next, quotaLeft) : null)
    if (next && !title) setTitle(titleFromFileName(next.name))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Choose a video file.')
    const problem = fileProblem(file, quotaLeft)
    if (problem) return setError(problem)
    if (!title.trim()) return setError('Give the film a title.')
    setSaving(true)
    setError(null)
    try {
      await onAdd({ file, title, opponent, gameDate, folderId })
      setFile(null)
      setTitle('')
      setOpponent('')
      setGameDate('')
      setFolderId('')
      setInputKey((k) => k + 1)
    } catch (err) {
      setError(message(err, 'Could not add the film.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="add-film" className="grid gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Clapperboard className="size-5 text-primary" aria-hidden />
        <h2 id="add-film" className="text-base font-semibold">
          Add film
        </h2>
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor="film-file" className="text-sm font-medium">
            Video file
          </label>
          <Input
            key={inputKey}
            id="film-file"
            type="file"
            accept={FILM_VIDEO_TYPES.join(',')}
            disabled={disabled || saving}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="h-10 py-1.5"
          />
          <p className="text-xs text-muted-foreground">
            MP4 (H.264) plays everywhere. MOV, M4V and WebM also work. Up to 20 GB, and{' '}
            {formatBytes(quotaLeft)} of team storage is free.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="film-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="film-title"
              value={title}
              maxLength={120}
              disabled={disabled || saving}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lincoln at Central"
              className="h-9"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="film-opponent" className="text-sm font-medium">
              Opponent <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="film-opponent"
              value={opponent}
              maxLength={80}
              disabled={disabled || saving}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Lincoln High"
              className="h-9"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="film-date" className="text-sm font-medium">
              Game date <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="film-date"
              type="date"
              value={gameDate}
              disabled={disabled || saving}
              onChange={(e) => setGameDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="film-folder" className="text-sm font-medium">
              Scout pack week <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <select
              id="film-folder"
              value={folderId}
              disabled={disabled || saving || weeks.length === 0}
              onChange={(e) => setFolderId(e.target.value)}
              className={FIELD}
            >
              <option value="">
                {weeks.length === 0 ? 'No scout packs yet' : 'Not in a pack'}
              </option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {packWeekLabel(w.opponent, w.name)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit" size="lg" disabled={disabled || saving || !file}>
            <Upload /> {saving ? 'Starting upload…' : 'Upload film'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function FilmRow({
  film,
  demo,
  week,
  uploadingNow,
  busy,
  confirming,
  watchingUrl,
  onWatch,
  onClose,
  onResume,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  film: Film
  demo: boolean
  week: PackWeek | null
  uploadingNow: boolean
  busy: boolean
  confirming: boolean
  watchingUrl: string | null
  onWatch: () => void
  onClose: () => void
  onResume: (file: File | undefined) => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  const details = [
    film.opponent,
    formatGameDate(film.gameDate) === '—' ? null : formatGameDate(film.gameDate),
    film.durationMs ? formatDuration(film.durationMs) : null,
    film.sizeBytes == null ? null : formatBytes(film.sizeBytes),
  ].filter(Boolean)
  const resumeId = `film-resume-${film.id}`
  const [videoFailed, setVideoFailed] = useState<string | null>(null)

  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium break-words">{film.title}</span>
            <Badge
              variant={
                film.status === 'ready'
                  ? 'secondary'
                  : film.status === 'failed'
                    ? 'destructive'
                    : 'outline'
              }
            >
              {uploadingNow ? 'Uploading' : statusLabel(film.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{details.join(' · ')}</p>
          {week ? (
            <p className="text-xs text-muted-foreground">
              Scout pack: {packWeekLabel(week.opponent, week.name)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {film.source === 'hudl_export' ? (
            <Button size="lg" variant="secondary" asChild>
              <Link to="/chart">
                <FolderOpen /> Open export
              </Link>
            </Button>
          ) : null}
          {film.status === 'ready' ? (
            <Button
              size="lg"
              variant={watchingUrl ? 'secondary' : 'default'}
              disabled={demo || busy}
              onClick={watchingUrl ? onClose : onWatch}
            >
              {watchingUrl ? <X /> : <Play />} {watchingUrl ? 'Close' : 'Watch'}
            </Button>
          ) : null}
          {film.status === 'uploading' && !uploadingNow ? (
            <>
              <label
                htmlFor={resumeId}
                className={cn(
                  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted',
                  demo && 'pointer-events-none opacity-50',
                )}
              >
                <RotateCw className="size-4" /> Resume upload
              </label>
              <input
                id={resumeId}
                type="file"
                accept={FILM_VIDEO_TYPES.join(',')}
                className="sr-only"
                disabled={demo}
                onChange={(e) => {
                  onResume(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </>
          ) : null}
          {confirming ? (
            <>
              <Button size="lg" variant="destructive" disabled={busy} onClick={onDelete}>
                <Trash2 /> {busy ? 'Deleting…' : 'Delete for good'}
              </Button>
              <Button size="lg" variant="ghost" disabled={busy} onClick={onCancelDelete}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="icon-lg"
              variant="ghost"
              disabled={demo || busy || uploadingNow}
              onClick={onAskDelete}
              aria-label={`Delete ${film.title}`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {confirming ? (
        <p className="text-sm text-muted-foreground">
          {film.source === 'hudl_export'
            ? 'This removes the game and its plays from Scheme HQ. The clips on your computer are not touched.'
            : 'This removes the video and every play marked on it. It cannot be undone.'}
        </p>
      ) : null}
      {film.status === 'uploading' && !uploadingNow ? (
        <p className="text-sm text-muted-foreground">
          This upload did not finish. Choose the same file ({formatBytes(film.sizeBytes ?? 0)}) to
          continue from where it stopped.
        </p>
      ) : null}
      {watchingUrl ? (
        <div className="grid gap-2">
          <video
            key={watchingUrl}
            src={watchingUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full max-w-full rounded-lg bg-black"
            onError={() => setVideoFailed(watchingUrl)}
            onLoadedMetadata={() => setVideoFailed(null)}
          />
          {videoFailed === watchingUrl ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              This video did not load. The link may have expired, or this browser cannot play the
              file.
              <Button size="sm" variant="outline" onClick={onWatch}>
                <RotateCw /> Reload
              </Button>
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
