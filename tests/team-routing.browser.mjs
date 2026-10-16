// Route-mocked team page check at 360 and desktop.
// Run: node tests/team-routing.browser.mjs http://127.0.0.1:5174
const appUrl = process.argv[2] ?? 'http://127.0.0.1:5174'
const origin = new URL(appUrl).origin
const TOKEN = 'b'.repeat(64)
const TEAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const COACH = '00000000-0000-4000-8000-0000000000c1'
let created = false
let inviteCalls = 0
const invites = []

function jwt(id, email) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({
    sub: id,
    email,
    role: 'authenticated',
    exp: 4_000_000_000,
  })}.sig`
}

function sessionFor(email) {
  const user = {
    id: COACH,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Hacked', coach: true },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  return {
    access_token: jwt(COACH, email),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4_000_000_000,
    refresh_token: `refresh-${COACH}`,
    user,
  }
}

function fulfill(body, status = 200) {
  return {
    responseCode: status,
    responseHeaders: [
      { name: 'content-type', value: 'application/json' },
      { name: 'access-control-allow-origin', value: origin },
      { name: 'access-control-allow-credentials', value: 'true' },
      { name: 'access-control-allow-headers', value: '*' },
      { name: 'access-control-allow-methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
    ],
    body: Buffer.from(body).toString('base64'),
  }
}

const version = await fetch('http://127.0.0.1:9334/json/version').then((response) =>
  response.json(),
)
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
  if (msg.method === 'Fetch.requestPaused') void answer(msg.params, msg.sessionId)
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
    if (body.email !== 'coach@demo.local' || body.password !== 'password1234') {
      await send(
        'Fetch.fulfillRequest',
        { requestId, ...fulfill(JSON.stringify({ message: 'Invalid' }), 400) },
        sessionId,
      )
      return
    }
    await send(
      'Fetch.fulfillRequest',
      { requestId, ...fulfill(JSON.stringify(sessionFor(body.email))) },
      sessionId,
    )
    return
  }
  if (url.includes('/auth/v1/user') || url.includes('/auth/v1/logout')) {
    await send(
      'Fetch.fulfillRequest',
      { requestId, ...fulfill('{}', url.includes('logout') ? 204 : 200) },
      sessionId,
    )
    return
  }
  if (url.includes('/rest/v1/memberships')) {
    const rows = created ? [{ role: 'head_coach', team_id: TEAM }] : []
    await send('Fetch.fulfillRequest', { requestId, ...fulfill(JSON.stringify(rows)) }, sessionId)
    return
  }
  if (url.includes('/rest/v1/rpc/create_team')) {
    created = true
    await send('Fetch.fulfillRequest', { requestId, ...fulfill(JSON.stringify(TEAM)) }, sessionId)
    return
  }
  if (url.includes('/rest/v1/teams')) {
    await send(
      'Fetch.fulfillRequest',
      {
        requestId,
        ...fulfill(JSON.stringify([{ name: 'Lone Peak Knights 2026', created_by: COACH }])),
      },
      sessionId,
    )
    return
  }
  if (url.includes('/rest/v1/roster_public')) {
    const rows = created
      ? [{ user_id: COACH, display_name: 'coach', position: null, role: 'head_coach' }]
      : []
    await send('Fetch.fulfillRequest', { requestId, ...fulfill(JSON.stringify(rows)) }, sessionId)
    return
  }
  if (url.includes('/rest/v1/invites') && request.method === 'GET') {
    await send(
      'Fetch.fulfillRequest',
      { requestId, ...fulfill(JSON.stringify(invites)) },
      sessionId,
    )
    return
  }
  if (url.includes('/rest/v1/rpc/create_invite')) {
    inviteCalls += 1
    const body = JSON.parse(request.postData ?? '{}')
    invites.push({
      id: 'invite-1',
      email: body.p_email,
      display_name: body.p_name,
      role: body.p_role,
      position: body.p_position,
    })
    await send('Fetch.fulfillRequest', { requestId, ...fulfill(JSON.stringify(TOKEN)) }, sessionId)
    return
  }
  if (url.includes('/rest/v1/invites') && request.method === 'DELETE') {
    invites.splice(0, invites.length)
    await send('Fetch.fulfillRequest', { requestId, ...fulfill('[]') }, sessionId)
    return
  }
  await send('Fetch.continueRequest', { requestId }, sessionId)
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
await send('Page.enable', {}, sessionId)
await send('Runtime.enable', {}, sessionId)
await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:54321/*' }] }, sessionId)

async function evalPage(expression) {
  const result = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  return result.result?.value
}

async function open(url) {
  await send('Page.navigate', { url: `${appUrl}/` }, sessionId)
  await new Promise((r) => setTimeout(r, 300))
  await evalPage('localStorage.clear(); sessionStorage.clear(); true')
  await send('Page.navigate', { url }, sessionId)
  await new Promise((r) => setTimeout(r, 400))
}

async function viewport(width) {
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 },
    sessionId,
  )
}

function setNamed(name, value) {
  return `(() => {
    const el = document.querySelector('[name="${name}"]')
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`
}

async function waitFor(pred, label) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < 8000) {
    last = await evalPage(
      `JSON.stringify({
        path: location.pathname,
        text: document.body.innerText,
        scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        link: document.querySelector('input[readonly]')?.value ?? '',
        buttons: [...document.querySelectorAll('button')].map((node) => ({
          text: node.innerText,
          h: Math.round(node.getBoundingClientRect().height),
          disabled: node.disabled
        })),
        box: Math.round(document.querySelector('.invite-consent input')?.getBoundingClientRect().height ?? 0)
      })`,
    )
    const parsed = JSON.parse(last)
    if (pred(parsed)) return parsed
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`${label} timed out. Last: ${last}`)
}

await viewport(360)
await open(`${appUrl}/login?next=%2F`)
await evalPage(`(() => {
  const inputs = [...document.querySelectorAll('input')]
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  proto.set.call(inputs[0], 'coach@demo.local')
  inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
  proto.set.call(inputs[1], 'password1234')
  inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('form').requestSubmit()
  return true
})()`)
await waitFor((page) => page.text.includes('Create team') && page.path === '/', 'create team')
await evalPage(setNamed('name', 'Lone Peak Knights 2026'))
await evalPage(setNamed('school', 'Lone Peak'))
await evalPage(setNamed('season', '2026'))
await evalPage(setNamed('ends', '2026-11-30'))
await evalPage(`document.querySelector('form').requestSubmit()`)
const createdPage = await waitFor(
  (page) => page.path === '/team' && page.text.includes('Lone Peak Knights 2026'),
  'roster',
)
await evalPage(setNamed('name', 'Sam Lee'))
await evalPage(setNamed('email', 'wr1@example.com'))
const blocked = await waitFor(
  (page) => page.buttons.some((button) => button.text === 'Create link' && button.disabled),
  'consent gate',
)
await evalPage(`(() => {
  const box = document.querySelector('.invite-consent input')
  box.click()
  return box.checked
})()`)
await waitFor(
  (page) => page.buttons.some((button) => button.text === 'Create link' && !button.disabled),
  'consent checked',
)
await evalPage(`document.querySelector('.invite-panel form').requestSubmit()`)
const linked = await waitFor(
  (page) => page.link.includes(`/accept-invite?token=${TOKEN}`) && page.scroll,
  'copyable link',
)
const phone = {
  width: 360,
  scroll: linked.scroll,
  box: linked.box,
  buttons: linked.buttons.filter(
    (button) =>
      ['Create link', 'Copy link', 'Revoke', 'Create team'].includes(button.text) || button.h > 0,
  ),
}
const mid = []
for (const width of [768, 1024]) {
  await viewport(width)
  await new Promise((r) => setTimeout(r, 150))
  mid.push(
    JSON.parse(
      await evalPage(
        `JSON.stringify({ width: window.innerWidth, scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 })`,
      ),
    ),
  )
}
await viewport(1366)
await new Promise((r) => setTimeout(r, 200))
const desktop = JSON.parse(
  await evalPage(
    `JSON.stringify({
      scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      width: window.innerWidth,
      buttons: [...document.querySelectorAll('button')].map((node) => ({
        text: node.innerText,
        h: Math.round(node.getBoundingClientRect().height)
      }))
    })`,
  ),
)
await viewport(1920)
await new Promise((r) => setTimeout(r, 200))
const wide = JSON.parse(
  await evalPage(
    `JSON.stringify({
      scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      width: window.innerWidth
    })`,
  ),
)

const report = {
  inviteCalls,
  created: createdPage.path,
  phone: { scroll: phone.scroll, box: blocked.box, link: linked.link, buttons: linked.buttons },
  desktop,
  wide,
  mid,
}
console.log(JSON.stringify(report, null, 2))
const short = linked.buttons.filter((button) => ['Create link', 'Copy link'].includes(button.text))
if (!linked.scroll || !desktop.scroll || !wide.scroll || mid.some((page) => !page.scroll)) {
  throw new Error('horizontal scroll')
}
if (short.some((button) => button.h < 44) || blocked.box < 44) throw new Error('target under 44px')
if (inviteCalls !== 1) throw new Error(`expected one create_invite, saw ${inviteCalls}`)
if (!linked.text.includes('coach')) throw new Error('roster missing coach')
await send('Target.closeTarget', { targetId })
ws.close()
