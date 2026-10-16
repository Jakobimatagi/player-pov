export type GestureKind =
  'tap' | 'double-tap' | 'swipe-x' | 'swipe-y' | 'orbit' | 'look' | 'pinch' | 'ignore'

export interface GestureResult {
  kind: GestureKind
  player: number
  dir: -1 | 1
  dx: number
  dy: number
  scale: number
}

export interface GestureTracker {
  active: boolean
  id: number
  x: number
  y: number
  t: number
  player: number
  lastX: number
  lastY: number
  lastTapT: number
  lastTapPlayer: number
  two: boolean
  id2: number
  x2: number
  y2: number
  pinch: number
  twoX: number
  twoY: number
  twoT: number
  looked: boolean
}

const result: GestureResult = { kind: 'ignore', player: -1, dir: 1, dx: 0, dy: 0, scale: 1 }

export function createTracker(): GestureTracker {
  return {
    active: false,
    id: -1,
    x: 0,
    y: 0,
    t: 0,
    player: -1,
    lastX: 0,
    lastY: 0,
    lastTapT: -1e9,
    lastTapPlayer: -1,
    two: false,
    id2: -1,
    x2: 0,
    y2: 0,
    pinch: 0,
    twoX: 0,
    twoY: 0,
    twoT: 0,
    looked: false,
  }
}

function finish(
  kind: GestureKind,
  player = -1,
  dir: -1 | 1 = 1,
  dx = 0,
  dy = 0,
  scale = 1,
): GestureResult {
  result.kind = kind
  result.player = player
  result.dir = dir
  result.dx = dx
  result.dy = dy
  result.scale = scale
  return result
}

export function noteDown(
  tr: GestureTracker,
  id: number,
  x: number,
  y: number,
  t: number,
  player: number,
): void {
  if (!tr.active) {
    tr.active = true
    tr.id = id
    tr.x = x
    tr.y = y
    tr.t = t
    tr.player = player
    tr.lastX = x
    tr.lastY = y
    tr.looked = false
    return
  }
  if (!tr.two && id !== tr.id) {
    tr.two = true
    tr.id2 = id
    tr.x2 = x
    tr.y2 = y
    tr.pinch = Math.hypot(x - tr.lastX, y - tr.lastY)
    tr.twoX = (tr.lastX + x) / 2
    tr.twoY = (tr.lastY + y) / 2
    tr.twoT = t
  }
}

export function noteMove(
  tr: GestureTracker,
  id: number,
  x: number,
  y: number,
  t: number,
  mode: string,
  attached: boolean,
): GestureResult {
  if (!tr.active) return finish('ignore')
  if (tr.two) {
    if (id === tr.id) {
      tr.lastX = x
      tr.lastY = y
    } else if (id === tr.id2) {
      tr.x2 = x
      tr.y2 = y
    } else return finish('ignore')
    const dist = Math.hypot(tr.x2 - tr.lastX, tr.y2 - tr.lastY)
    const scale = tr.pinch > 1 ? dist / tr.pinch : 1
    tr.pinch = dist
    if (mode === 'pov') return finish('ignore')
    return finish('pinch', -1, 1, 0, 0, scale)
  }
  if (id !== tr.id) return finish('ignore')
  const dx = x - tr.x
  const dy = y - tr.y
  const stepX = x - tr.lastX
  const stepY = y - tr.lastY
  tr.lastX = x
  tr.lastY = y
  if (mode === 'pov' && Math.hypot(dx, dy) > 10) {
    tr.looked = true
    return finish('look', -1, 1, stepX, stepY)
  }
  const dt = t - tr.t
  const heldSwipe = attached && dt < 400 && Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)
  const heldVertical = attached && dt < 400 && Math.abs(dy) > 60 && Math.abs(dy) > 2 * Math.abs(dx)
  if (heldSwipe || heldVertical) return finish('ignore')
  if (mode === 'broadcast' && Math.hypot(dx, dy) > 10) return finish('orbit', -1, 1, stepX, stepY)
  return finish('ignore')
}

function twoFingerHop(
  tr: GestureTracker,
  dx: number,
  dy: number,
  dt: number,
  attached: boolean,
  mode: string,
): GestureResult | null {
  if (mode !== 'pov' || !attached || dt >= 400) return null
  if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
    return finish('swipe-x', tr.player, dx > 0 ? 1 : -1)
  }
  if (Math.abs(dy) > 60 && Math.abs(dy) > 2 * Math.abs(dx)) {
    return finish('swipe-y', tr.player, dy > 0 ? 1 : -1)
  }
  return null
}

export function noteUp(
  tr: GestureTracker,
  id: number,
  x: number,
  y: number,
  t: number,
  attached: boolean,
  mode = 'broadcast',
): GestureResult {
  if (!tr.active || (id !== tr.id && id !== tr.id2)) return finish('ignore')
  if (tr.two) {
    if (id === tr.id) {
      tr.lastX = x
      tr.lastY = y
    } else {
      tr.x2 = x
      tr.y2 = y
    }
    const dx = (tr.lastX + tr.x2) / 2 - tr.twoX
    const dy = (tr.lastY + tr.y2) / 2 - tr.twoY
    const dt = t - tr.twoT
    tr.two = false
    tr.looked = false
    if (id === tr.id) tr.active = false
    else {
      tr.x = tr.lastX
      tr.y = tr.lastY
      tr.t = t
    }
    return twoFingerHop(tr, dx, dy, dt, attached, mode) ?? finish('ignore')
  }
  const dx = x - tr.x
  const dy = y - tr.y
  const dt = t - tr.t
  const player = tr.player
  const looked = tr.looked
  tr.looked = false
  tr.active = false
  const povLook = looked || mode === 'pov'
  if (!povLook && attached && dt < 400 && Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
    return finish('swipe-x', player, dx > 0 ? 1 : -1)
  }
  if (!povLook && attached && dt < 400 && Math.abs(dy) > 60 && Math.abs(dy) > 2 * Math.abs(dx)) {
    return finish('swipe-y', player, dy > 0 ? 1 : -1)
  }
  if (!looked && Math.hypot(dx, dy) < 10 && dt < 250) {
    if (player >= 0 && player === tr.lastTapPlayer && t - tr.lastTapT < 300) {
      tr.lastTapT = -1e9
      tr.lastTapPlayer = -1
      return finish('double-tap', player)
    }
    tr.lastTapT = t
    tr.lastTapPlayer = player
    return finish('tap', player)
  }
  return finish('ignore')
}
