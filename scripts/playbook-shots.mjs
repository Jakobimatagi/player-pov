import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const url = process.env.PLAYBOOK_URL ?? 'http://127.0.0.1:5173'
const out = process.env.PLAYBOOK_SHOTS ?? '/tmp/playbook-shots'
mkdirSync(out, { recursive: true })

const teamId = '00000000-0000-4000-8000-0000000000a1'
const userId = '00000000-0000-4000-8000-000000000001'
const widths = [360, 768, 1024, 1366, 1920]

function token(sub) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 60 * 60
  return { jwt: `${part({ alg: 'none' })}.${part({ sub, exp, role: 'authenticated' })}.`, exp }
}

function session(sub, email) {
  const { jwt, exp } = token(sub)
  return {
    access_token: jwt,
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: {
      id: sub,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-23T00:00:00.000Z',
    },
  }
}

const plays = [
  {
    id: 'flood',
    team_id: teamId,
    name: 'Flood',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    archived_at: null,
  },
  {
    id: 'iso',
    team_id: teamId,
    name: 'Iso',
    side: 'offense',
    current_version: 1,
    default_look_id: null,
    updated_at: '2026-10-23T00:00:00.000Z',
    archived_at: null,
  },
]
const books = [{ id: 'pb1', team_id: teamId, name: 'PB1', archived_at: null }]
const links = [{ playbook_id: 'pb1', play_id: 'flood', sort: 1 }]

function visiblePlays(role, requestUrl) {
  const parsed = new URL(requestUrl)
  let rows = plays.filter((play) => play.archived_at == null)
  if (role === 'player') rows = rows.filter((play) => play.id === 'flood')
  const idFilter = parsed.searchParams.get('id')
  if (idFilter != null && idFilter.startsWith('in.(')) {
    const ids = idFilter.slice(4, -1).split(',')
    rows = rows.filter((play) => ids.includes(play.id))
  }
  return rows
}

async function install(page, role) {
  const sub = role === 'player' ? '00000000-0000-4000-8000-000000000002' : userId
  const email = role === 'player' ? 'player@demo.local' : 'coach@demo.local'
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    { key: 'sb-127-auth-token', value: session(sub, email) },
  )
  await page.route('**/*', async (route) => {
    const request = route.request()
    const target = request.url()
    if (!target.includes('127.0.0.1:54321') && !target.includes('localhost:54321')) {
      await route.continue()
      return
    }
    const parsed = new URL(target)
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      })
      return
    }
    if (parsed.pathname.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(session(sub, email).user),
      })
      return
    }
    if (parsed.pathname.endsWith('/memberships')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify([
          { role: role === 'player' ? 'player' : 'head_coach', team_id: teamId },
        ]),
      })
      return
    }
    if (parsed.pathname.endsWith('/playbooks')) {
      await listsReady
      await route.fulfill({ status: 200, headers, body: JSON.stringify(books) })
      return
    }
    if (parsed.pathname.endsWith('/playbook_plays')) {
      const book = parsed.searchParams.get('playbook_id') ?? ''
      const rows = book.startsWith('eq.')
        ? links.filter((link) => link.playbook_id === book.slice(3))
        : links
      await route.fulfill({ status: 200, headers, body: JSON.stringify(rows) })
      return
    }
    if (parsed.pathname.endsWith('/plays') && request.method() === 'GET') {
      await listsReady
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(visiblePlays(role, target)),
      })
      return
    }
    if (parsed.pathname.endsWith('/plays') && request.method() === 'PATCH') {
      const id = (parsed.searchParams.get('id') ?? '').replace(/^eq\./, '')
      const body = request.postDataJSON()
      const play = plays.find((item) => item.id === id)
      if (play && body) Object.assign(play, body)
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(play ? [{ id: play.id }] : []),
      })
      return
    }
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify([]),
    })
  })
}

let releaseLists = () => {}
const listsReady = new Promise((resolve) => {
  releaseLists = resolve
})

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader'],
})

const coach = await browser.newPage()
await install(coach, 'head_coach')
await coach.setViewportSize({ width: 360, height: 800 })
await coach.goto(`${url}/playbook`, { waitUntil: 'domcontentloaded' })
await coach.getByRole('heading', { name: 'Playbook' }).waitFor()
await coach.getByText('Loading…').waitFor()
const loadingText = await coach.locator('body').innerText()
if (loadingText.includes('No plays')) {
  throw new Error(`loading state showed No plays: ${loadingText}`)
}
await coach.screenshot({ path: `${out}/playbook-loading.png`, fullPage: true })
releaseLists()
await coach.getByText('Flood', { exact: true }).waitFor()
await coach.getByText('Loading…').waitFor({ state: 'hidden' })
const coachText = await coach.locator('body').innerText()
for (const word of ['Edit play', 'New play', 'Watch']) {
  if (coachText.includes(word)) throw new Error(`coach list shows ${word}`)
}
if (!coachText.includes('Rename') || !coachText.includes('Delete')) {
  throw new Error(`coach list missing rename or delete: ${coachText}`)
}

const measures = []
for (const width of widths) {
  await coach.setViewportSize({ width, height: 900 })
  await coach.getByRole('heading', { name: 'Playbook' }).waitFor()
  const box = await coach.evaluate(() => {
    const root = document.documentElement
    const row = document.querySelector('.playbook-row')
    const action = document.querySelector('.playbook-action')
    const height = (node) => (node ? node.getBoundingClientRect().height : 0)
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      row: height(row),
      action: height(action),
    }
  })
  if (box.scrollWidth > box.clientWidth + 1) {
    throw new Error(`${width}px scrolls sideways ${box.scrollWidth} > ${box.clientWidth}`)
  }
  if (box.row < 44 || box.action < 44) {
    throw new Error(`${width}px target under 44px row=${box.row} action=${box.action}`)
  }
  measures.push({ width, ...box })
  await coach.screenshot({ path: `${out}/playbook-${width}.png`, fullPage: true })
}

await coach.getByLabel('Search plays').fill('Iso')
await coach.getByText('Flood', { exact: true }).waitFor({ state: 'hidden' })
await coach.getByLabel('Search plays').fill('')
await coach.getByRole('button', { name: 'PB1' }).click()
await coach.getByText('Iso', { exact: true }).waitFor({ state: 'hidden' })
await coach.getByRole('button', { name: 'All' }).click()
await coach.getByRole('button', { name: 'Rename' }).first().click()
await coach.getByLabel('Name for Flood').fill('Flood Left')
await coach.getByRole('button', { name: 'Save name' }).click()
await coach.getByText('Flood Left', { exact: true }).waitFor()
await coach.getByRole('button', { name: 'Delete' }).first().click()
await coach.getByText('Flood Left', { exact: true }).waitFor({ state: 'hidden' })

plays[0].name = 'Flood'
plays[0].archived_at = null

const player = await browser.newPage()
await install(player, 'player')
await player.setViewportSize({ width: 360, height: 800 })
await player.goto(`${url}/playbook`, { waitUntil: 'domcontentloaded' })
await player.getByText('Flood', { exact: true }).waitFor()
const playerText = await player.locator('body').innerText()
for (const word of ['Watch', 'Edit play', 'Rename', 'Delete', 'New play']) {
  if (playerText.includes(word)) throw new Error(`player view shows ${word}`)
}
await player.screenshot({ path: `${out}/playbook-player-360.png`, fullPage: true })

await browser.close()
console.log(JSON.stringify(measures, null, 2))
