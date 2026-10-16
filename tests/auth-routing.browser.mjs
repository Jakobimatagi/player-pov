// Equivalent of the QA Playwright repro. Mocks 127.0.0.1:54321 and drives the dev server.
// Run: node tests/auth-routing.browser.mjs http://127.0.0.1:5174
const appUrl = process.argv[2] ?? 'http://127.0.0.1:5174'
const origin = new URL(appUrl).origin
const TOKEN = 'a'.repeat(64)
const USERS = {
  'player@demo.local': {
    id: '00000000-0000-4000-8000-0000000000b1',
    role: 'player',
  },
  'invitee@demo.local': {
    id: '00000000-0000-4000-8000-0000000000b2',
    role: null,
  },
  'coach@demo.local': {
    id: '00000000-0000-4000-8000-0000000000b3',
    role: null,
  },
}
let inviteeAccepted = false
let acceptCalls = 0

function jwt(user) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    exp: 4_000_000_000,
  })}.sig`
}

function sessionFor(email) {
  const row = USERS[email]
  const user = {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  return {
    access_token: jwt({ ...row, email }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4_000_000_000,
    refresh_token: `refresh-${row.id}`,
    user,
  }
}

function membershipFor(url) {
  const id = new URL(url).searchParams.get('user_id')?.replace(/^eq\./, '')
  if (id === USERS['player@demo.local'].id) return [{ role: 'player' }]
  if (id === USERS['invitee@demo.local'].id && inviteeAccepted) return [{ role: 'player' }]
  return []
}

function fulfill(body, status = 200) {
  return {
    responseCode: status,
    responseHeaders: [
      { name: 'content-type', value: 'application/json' },
      { name: 'access-control-allow-origin', value: origin },
      { name: 'access-control-allow-credentials', value: 'true' },
      { name: 'access-control-allow-headers', value: '*' },
      { name: 'access-control-allow-methods', value: 'GET,POST,OPTIONS' },
    ],
    body: Buffer.from(body).toString('base64'),
  }
}

const version = await fetch('http://127.0.0.1:9334/json/version').then((r) => r.json())
const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Fetch.requestPaused') {
    void answer(msg.params, msg.sessionId)
  }
})
function send(method, params = {}, sessionId) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) =>
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result),
    )
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    ws.send(JSON.stringify(payload))
  })
}

async function answer(params, sessionId) {
  const { requestId, request } = params
  const url = request.url
  if (request.method === 'OPTIONS') {
    await send('Fetch.fulfillRequest', { requestId, ...fulfill('', 204) }, sessionId)
    return
  }
  if (url.includes('/auth/v1/token')) {
    const body = JSON.parse(request.postData ?? '{}')
    if (body.password !== 'password1234' || USERS[body.email] == null) {
      await send(
        'Fetch.fulfillRequest',
        {
          requestId,
          ...fulfill(JSON.stringify({ error: 'invalid_credentials', message: 'Invalid' }), 400),
        },
        sessionId,
      )
      return
    }
    await new Promise((r) => setTimeout(r, 250))
    await send(
      'Fetch.fulfillRequest',
      { requestId, ...fulfill(JSON.stringify(sessionFor(body.email))) },
      sessionId,
    )
    return
  }
  if (url.includes('/rest/v1/memberships')) {
    await new Promise((r) => setTimeout(r, 250))
    await send(
      'Fetch.fulfillRequest',
      { requestId, ...fulfill(JSON.stringify(membershipFor(url))) },
      sessionId,
    )
    return
  }
  if (url.includes('/rest/v1/rpc/accept_invite')) {
    acceptCalls += 1
    const body = JSON.parse(request.postData ?? '{}')
    const bearer = request.headers?.Authorization ?? request.headers?.authorization ?? ''
    const inviteeToken = sessionFor('invitee@demo.local').access_token
    if (body.token === TOKEN && bearer.includes(inviteeToken)) inviteeAccepted = true
    else {
      await send(
        'Fetch.fulfillRequest',
        {
          requestId,
          ...fulfill(
            JSON.stringify({ message: 'invite email does not match', code: 'P0001' }),
            400,
          ),
        },
        sessionId,
      )
      return
    }
    await send(
      'Fetch.fulfillRequest',
      { requestId, ...fulfill(JSON.stringify(USERS['invitee@demo.local'].id)) },
      sessionId,
    )
    return
  }
  if (url.includes('/auth/v1/user')) {
    await send('Fetch.fulfillRequest', { requestId, ...fulfill(JSON.stringify({})) }, sessionId)
    return
  }
  await send('Fetch.continueRequest', { requestId }, sessionId)
}

async function page() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:54321/*' }] }, sessionId)
  return { targetId, sessionId }
}

async function open(sessionId, url) {
  await send('Page.navigate', { url: `${appUrl}/` }, sessionId)
  await new Promise((r) => setTimeout(r, 300))
  await evalPage(sessionId, `localStorage.clear(); sessionStorage.clear(); true`)
  await send('Page.navigate', { url }, sessionId)
  await new Promise((r) => setTimeout(r, 400))
}

async function evalPage(sessionId, expression) {
  const result = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  return result.result?.value
}

async function fillLogin(sessionId, email) {
  await evalPage(
    sessionId,
    `(() => {
      const inputs = [...document.querySelectorAll('input')]
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      proto.set.call(inputs[0], ${JSON.stringify(email)})
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
      proto.set.call(inputs[1], 'password1234')
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('form').requestSubmit()
      return true
    })()`,
  )
}

async function waitFor(sessionId, pred, label) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < 8000) {
    last = await evalPage(
      sessionId,
      `JSON.stringify({ path: location.pathname + location.search, text: document.body.innerText })`,
    )
    const parsed = JSON.parse(last)
    if (pred(parsed)) return parsed
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`${label} timed out. Last: ${last}`)
}

const results = []
{
  const { targetId, sessionId } = await page()
  await open(sessionId, `${appUrl}/login?next=%2F`)
  await fillLogin(sessionId, 'player@demo.local')
  const seen = await waitFor(
    sessionId,
    (page) => page.text.includes('Player Home') && page.path === '/',
    'player login',
  )
  results.push({ name: 'player login', ...seen, acceptCalls })
  await send('Target.closeTarget', { targetId })
}
{
  const { targetId, sessionId } = await page()
  await open(sessionId, `${appUrl}/login?next=%2F`)
  await fillLogin(sessionId, 'coach@demo.local')
  const seen = await waitFor(
    sessionId,
    (page) => page.text.includes('Create team') && page.path === '/',
    'coach login',
  )
  results.push({ name: 'coach login', ...seen })
  await send('Target.closeTarget', { targetId })
}
{
  acceptCalls = 0
  inviteeAccepted = false
  const { targetId, sessionId } = await page()
  await open(sessionId, `${appUrl}/accept-invite?token=${TOKEN}`)
  const stripped = await waitFor(
    sessionId,
    (page) => page.path === '/accept-invite' && page.text.includes('Log in'),
    'strip token',
  )
  await evalPage(sessionId, `document.querySelector('a.auth-textlink').click()`)
  await waitFor(sessionId, (page) => page.path.startsWith('/login'), 'login from invite')
  await fillLogin(sessionId, 'invitee@demo.local')
  const seen = await waitFor(
    sessionId,
    (page) => page.text.includes('Player Home') && page.path === '/',
    'invite login',
  )
  results.push({ name: 'invite login', ...seen, acceptCalls, stripped: stripped.path })
  await send('Target.closeTarget', { targetId })
}

console.log(JSON.stringify({ acceptCalls, results }, null, 2))
if (acceptCalls !== 1) throw new Error(`expected one accept_invite call, saw ${acceptCalls}`)
ws.close()
