// Game film storage on Cloudflare R2 (issue #59).
//
// The browser never holds R2 keys. Every call forwards the user's token, the database
// decides (public.film_object_allowed and the film RLS), and this function hands out
// short-lived signed URLs. Uploads are S3 multipart, so a dropped connection resumes from
// the last finished part instead of starting over.
//
// Secrets (supabase secrets set ...): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET (or R2_BUCKET_NAME). SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const SIGNED_URL_SECONDS = 3600
const MAX_SIGN_PARTS = 100
const MAX_DURATION_MS = 6 * 60 * 60 * 1000
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm']

// Browsers may call this from the app (APP_URL), local dev, and any extra origins listed
// in ALLOWED_ORIGINS (comma separated). Anything else gets no CORS headers.
const ORIGINS = new Set(
  [
    Deno.env.get('APP_URL') ?? '',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(','),
  ]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
)

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (!ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

type Body = {
  action?: string
  filmId?: string
  contentType?: string
  uploadId?: string
  partNumbers?: number[]
  parts?: { partNumber: number; etag: string }[]
  durationMs?: number
}

type FilmRow = {
  id: string
  team_id: string
  storage_key: string
  proxy_key: string | null
  status: string
  size_bytes: number
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

// Same rule as the client: parts of at least 16 MiB, and never more than 9,000 of them
// (S3 allows 10,000). Every part but the last has this size.
export function partSizeFor(sizeBytes: number): number {
  const mib = 1024 * 1024
  return Math.max(16 * mib, Math.ceil(sizeBytes / 9000 / mib) * mib)
}

function r2() {
  const account = Deno.env.get('R2_ACCOUNT_ID') ?? ''
  const bucket = Deno.env.get('R2_BUCKET') || Deno.env.get('R2_BUCKET_NAME') || ''
  const client = new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
    service: 's3',
    region: 'auto',
  })
  const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`
  const objectUrl = (key: string, query: Record<string, string> = {}) => {
    const url = new URL(`${base}/${key.split('/').map(encodeURIComponent).join('/')}`)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    return url
  }
  const bucketUrl = (query: Record<string, string>) => {
    const url = new URL(base)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    return url
  }
  const send = async (url: URL, init: RequestInit = {}) => {
    const res = await client.fetch(url.toString(), init)
    if (!res.ok && res.status !== 404) {
      throw new HttpError(502, `Storage error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    return res
  }
  const presign = async (url: URL, method: string) => {
    url.searchParams.set('X-Amz-Expires', String(SIGNED_URL_SECONDS))
    const signed = await client.sign(url.toString(), { method, aws: { signQuery: true } })
    return signed.url
  }
  return { objectUrl, bucketUrl, send, presign }
}

const tag = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1] ?? '')

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function loadFilm(user: SupabaseClient, filmId: string | undefined): Promise<FilmRow> {
  if (!filmId) throw new HttpError(400, 'filmId is required')
  const { data, error } = await user
    .from('film')
    .select('id, team_id, source, storage_key, proxy_key, status, size_bytes')
    .eq('id', filmId)
    .maybeSingle()
  if (error) throw new HttpError(400, error.message)
  if (!data) throw new HttpError(404, 'Film not found')
  // A Hudl export game keeps its clips on the coach's computer; there is nothing stored.
  if (data.source === 'hudl_export' || !data.storage_key) {
    throw new HttpError(400, 'This game has no stored video')
  }
  return data as FilmRow
}

async function allowed(user: SupabaseClient, key: string, action: string) {
  const { data, error } = await user.rpc('film_object_allowed', { p_key: key, p_action: action })
  if (error) throw new HttpError(400, error.message)
  if (data !== true) throw new HttpError(403, 'Not allowed')
}

async function handle(req: Request): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  const user = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  const { data: who } = await user.auth.getUser()
  if (!who.user) throw new HttpError(401, 'Sign in required')

  const body = (await req.json()) as Body
  const store = r2()
  const film = await loadFilm(user, body.filmId)
  const key = film.storage_key

  switch (body.action) {
    case 'start': {
      await allowed(user, key, 'upload')
      const contentType = body.contentType ?? ''
      if (!VIDEO_TYPES.includes(contentType)) {
        throw new HttpError(400, 'Upload an MP4, MOV, M4V or WebM video')
      }
      const res = await store.send(store.objectUrl(key, { uploads: '' }), {
        method: 'POST',
        headers: { 'Content-Type': contentType },
      })
      const uploadId = tag(await res.text(), 'UploadId')[0]
      if (!uploadId) throw new HttpError(502, 'Storage did not start the upload')
      return json({ uploadId, partSize: partSizeFor(film.size_bytes) })
    }

    case 'sign-parts': {
      await allowed(user, key, 'upload')
      const numbers = body.partNumbers ?? []
      if (!body.uploadId || numbers.length < 1 || numbers.length > MAX_SIGN_PARTS) {
        throw new HttpError(400, `Ask for 1 to ${MAX_SIGN_PARTS} parts with an uploadId`)
      }
      const urls: Record<number, string> = {}
      for (const n of numbers) {
        if (!Number.isInteger(n) || n < 1 || n > 10000) throw new HttpError(400, 'Bad part number')
        urls[n] = await store.presign(
          store.objectUrl(key, { partNumber: String(n), uploadId: body.uploadId }),
          'PUT',
        )
      }
      return json({ urls })
    }

    case 'list-parts': {
      await allowed(user, key, 'upload')
      if (!body.uploadId) throw new HttpError(400, 'uploadId is required')
      const parts: { partNumber: number; etag: string; size: number }[] = []
      let marker = '0'
      for (;;) {
        const res = await store.send(
          store.objectUrl(key, { uploadId: body.uploadId, 'part-number-marker': marker }),
        )
        if (res.status === 404) return json({ parts: [], expired: true })
        const xml = await res.text()
        for (const part of tag(xml, 'Part')) {
          parts.push({
            partNumber: Number(tag(part, 'PartNumber')[0]),
            etag: tag(part, 'ETag')[0] ?? '',
            size: Number(tag(part, 'Size')[0]),
          })
        }
        if (tag(xml, 'IsTruncated')[0] !== 'true') break
        marker = tag(xml, 'NextPartNumberMarker')[0] ?? ''
        if (!marker) break
      }
      return json({ parts })
    }

    case 'complete': {
      await allowed(user, key, 'upload')
      const parts = [...(body.parts ?? [])].sort((a, b) => a.partNumber - b.partNumber)
      const duration = body.durationMs ?? 0
      if (!body.uploadId || parts.length < 1)
        throw new HttpError(400, 'uploadId and parts are required')
      if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_MS) {
        throw new HttpError(400, 'durationMs must be a whole number of milliseconds, up to 6 hours')
      }
      const xml =
        '<CompleteMultipartUpload>' +
        parts
          .map(
            (p) =>
              `<Part><PartNumber>${Number(p.partNumber)}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`,
          )
          .join('') +
        '</CompleteMultipartUpload>'
      const done = await store.send(store.objectUrl(key, { uploadId: body.uploadId }), {
        method: 'POST',
        body: xml,
      })
      const doneText = await done.text()
      if (done.status === 404 || doneText.includes('<Error>')) {
        throw new HttpError(409, 'The upload could not be finished. Start it again.')
      }
      // The quota counts the declared size, so the stored file must match it.
      const head = await store.send(store.objectUrl(key), { method: 'HEAD' })
      const stored = Number(head.headers.get('content-length') ?? -1)
      const admin = createClient(url, service)
      if (stored !== film.size_bytes) {
        await store.send(store.objectUrl(key), { method: 'DELETE' })
        await admin.from('film').update({ status: 'failed' }).eq('id', film.id)
        throw new HttpError(400, 'The uploaded file is not the size that was declared')
      }
      const { error } = await admin
        .from('film')
        .update({ status: 'ready', proxy_key: key, duration_ms: duration })
        .eq('id', film.id)
      if (error) throw new HttpError(500, error.message)
      return json({ status: 'ready' })
    }

    case 'abort': {
      await allowed(user, key, 'upload')
      if (!body.uploadId) throw new HttpError(400, 'uploadId is required')
      await store.send(store.objectUrl(key, { uploadId: body.uploadId }), { method: 'DELETE' })
      return json({ aborted: true })
    }

    case 'read': {
      if (film.status !== 'ready' || !film.proxy_key)
        throw new HttpError(409, 'Film is not ready yet')
      await allowed(user, film.proxy_key, 'read')
      return json({
        url: await store.presign(store.objectUrl(film.proxy_key), 'GET'),
        expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString(),
      })
    }

    case 'delete': {
      await allowed(user, key, 'delete')
      const prefix = `${film.team_id}/${film.id}/`
      // Half-finished uploads still take up storage, so abort them too.
      const pending = await (await store.send(store.bucketUrl({ uploads: '', prefix }))).text()
      for (const upload of tag(pending, 'Upload')) {
        const k = tag(upload, 'Key')[0]
        const id = tag(upload, 'UploadId')[0]
        if (k && id) await store.send(store.objectUrl(k, { uploadId: id }), { method: 'DELETE' })
      }
      let token = ''
      for (;;) {
        const query: Record<string, string> = { 'list-type': '2', prefix }
        if (token) query['continuation-token'] = token
        const xml = await (await store.send(store.bucketUrl(query))).text()
        for (const k of tag(xml, 'Key')) {
          await store.send(store.objectUrl(k), { method: 'DELETE' })
        }
        token = tag(xml, 'NextContinuationToken')[0] ?? ''
        if (!token) break
      }
      const admin = createClient(url, service)
      const { error } = await admin.from('film').delete().eq('id', film.id)
      if (error) throw new HttpError(500, error.message)
      return json({ deleted: true })
    }

    default:
      throw new HttpError(400, 'Unknown action')
  }
}

async function respond(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    return await handle(req)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error(err)
    return json({ error: 'Something went wrong' }, 500)
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const res = await respond(req)
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
  return res
})
