import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  ShaderMaterial,
  Vector2,
} from 'three'
import { yardsToWorld } from '../play/coords'

/** CSS pixels. Device pixels are this times the renderer dpr, updated on resize. */
export const ROUTE_CSS_PX = 6
export const ROUTE_COLOR = '#fff4c2'
const ROUTE_Y = 0.08

const VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec2 aCorner;
uniform vec2 uResolution;
uniform float uWidth;

void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
  // Drop only chords that sit entirely behind the eye. A chord that crosses
  // the near plane keeps the visible part, so a POV route still reaches the field.
  if (a.w < 0.05 && b.w < 0.05) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  if (a.w < 0.05 || b.w < 0.05) {
    float t = clamp((0.05 - a.w) / (b.w - a.w), 0.0, 1.0);
    vec4 clipped = mix(a, b, t);
    if (a.w < 0.05) a = clipped;
    else b = clipped;
  }
  vec2 ndcA = a.xy / a.w;
  vec2 ndcB = b.xy / b.w;
  vec2 dirPx = (ndcB - ndcA) * (uResolution * 0.5);
  float len = length(dirPx);
  vec2 side = len < 0.001 ? vec2(0.0, 1.0) : vec2(-dirPx.y, dirPx.x) / len;
  vec2 offsetPx = side * aCorner.y * uWidth * 0.5;
  vec4 clip = aCorner.x > 0.5 ? b : a;
  vec2 ndc = clip.xy / clip.w + (offsetPx * 2.0) / max(uResolution, vec2(1.0));
  gl_Position = vec4(ndc * clip.w, clip.z, clip.w);
}
`

const FRAG = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}
`

export interface RouteWaypoints {
  count: number
  wpStart: ArrayLike<number>
  wpX: ArrayLike<number>
  wpY: ArrayLike<number>
}

/**
 * Chords the ribbon will draw. Each chord is two triangles, so this cap is
 * 258 triangles. A longer chart thins until it fits. R1 is decided: the play
 * budget is at most 6,000 triangles and 10 meshes. The ribbon stays inside this cap.
 */
export const ROUTE_SEGMENT_CAP = 129

function rawSegments(play: RouteWaypoints): number {
  let segments = 0
  for (let i = 0; i < play.count; i += 1) {
    const start = play.wpStart[i] ?? 0
    const end = play.wpStart[i + 1] ?? start
    if (end - start > 1) segments += end - start - 1
  }
  return segments
}

function chordCount(waypointCount: number, stride: number): number {
  if (waypointCount < 2) return 0
  if (stride <= 1) return waypointCount - 1
  let chords = 0
  let prev = 0
  for (let k = stride; k < waypointCount - 1; k += stride) {
    chords += 1
    prev = k
  }
  if (prev < waypointCount - 1) chords += 1
  return chords
}

function chordsAtStride(play: RouteWaypoints, stride: number): number {
  let segments = 0
  for (let i = 0; i < play.count; i += 1) {
    const start = play.wpStart[i] ?? 0
    const end = play.wpStart[i + 1] ?? start
    segments += chordCount(end - start, stride)
  }
  return segments
}

/**
 * Stride that stays at the chord cap. `ceil(raw / cap)` can still overshoot,
 * because each route keeps its last point, so the stride steps up until the
 * drawn chords fit.
 */
function routeStride(play: RouteWaypoints): number {
  const total = rawSegments(play)
  if (total <= ROUTE_SEGMENT_CAP) return 1
  let stride = Math.ceil(total / ROUTE_SEGMENT_CAP)
  let longest = 2
  for (let i = 0; i < play.count; i += 1) {
    const start = play.wpStart[i] ?? 0
    const end = play.wpStart[i + 1] ?? start
    if (end - start > longest) longest = end - start
  }
  while (stride < longest && chordsAtStride(play, stride) > ROUTE_SEGMENT_CAP) stride += 1
  return stride
}

/** One screen-space ribbon. Two triangles per chord, thinned to the segment cap. */
export function buildRouteRibbon(play: RouteWaypoints): BufferGeometry {
  const stride = routeStride(play)
  let segments = 0
  for (let i = 0; i < play.count; i += 1) {
    const start = play.wpStart[i] ?? 0
    const end = play.wpStart[i + 1] ?? start
    segments += chordCount(end - start, stride)
  }
  const starts = new Float32Array(segments * 4 * 3)
  const ends = new Float32Array(segments * 4 * 3)
  const corners = new Float32Array(segments * 4 * 2)
  const positions = new Float32Array(segments * 4 * 3)
  const indices = new Uint32Array(segments * 6)
  const world = { x: 0, y: 0, z: 0 }
  const corner = [
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 1],
  ]
  let vert = 0
  let index = 0
  for (let i = 0; i < play.count; i += 1) {
    const start = play.wpStart[i] ?? 0
    const end = play.wpStart[i + 1] ?? start
    const step = stride <= 1 ? 1 : stride
    for (let k = start; k < end - 1;) {
      let next = k + step
      if (next > end - 1) next = end - 1
      if (next === k) break
      yardsToWorld(play.wpX[k] ?? 0, play.wpY[k] ?? 0, ROUTE_Y, world)
      const ax = world.x
      const ay = world.y
      const az = world.z
      yardsToWorld(play.wpX[next] ?? 0, play.wpY[next] ?? 0, ROUTE_Y, world)
      const bx = world.x
      const by = world.y
      const bz = world.z
      const base = vert
      for (let c = 0; c < 4; c += 1) {
        const atEnd = corner[c]?.[0] === 1
        const o = vert * 3
        starts[o] = ax
        starts[o + 1] = ay
        starts[o + 2] = az
        ends[o] = bx
        ends[o + 1] = by
        ends[o + 2] = bz
        positions[o] = atEnd ? bx : ax
        positions[o + 1] = atEnd ? by : ay
        positions[o + 2] = atEnd ? bz : az
        corners[vert * 2] = corner[c]?.[0] ?? 0
        corners[vert * 2 + 1] = corner[c]?.[1] ?? 1
        vert += 1
      }
      indices[index] = base
      indices[index + 1] = base + 1
      indices[index + 2] = base + 3
      indices[index + 3] = base
      indices[index + 4] = base + 3
      indices[index + 5] = base + 2
      index += 6
      k = next
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aStart', new Float32BufferAttribute(starts, 3))
  geometry.setAttribute('aEnd', new Float32BufferAttribute(ends, 3))
  geometry.setAttribute('aCorner', new Float32BufferAttribute(corners, 2))
  geometry.setIndex(Array.from(indices))
  geometry.computeBoundingSphere()
  return geometry
}

export function createRouteMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uResolution: { value: new Vector2(1, 1) },
      uWidth: { value: ROUTE_CSS_PX },
      uColor: { value: new Color(ROUTE_COLOR) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    toneMapped: false,
    depthTest: true,
    // The turf is drawn later and would cover a depth-less ribbon. Writing depth
    // keeps the line, which sits just above the grass, in front of the field.
    depthWrite: true,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
}

/** Pixel width tracks the drawing buffer. Call this on resize, not every frame. */
export function sizeRouteMaterial(
  material: ShaderMaterial,
  viewWidth: number,
  viewHeight: number,
  dpr: number,
): void {
  const px = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const resolution = material.uniforms['uResolution']?.value as Vector2 | undefined
  resolution?.set(Math.max(viewWidth, 1) * px, Math.max(viewHeight, 1) * px)
  const width = material.uniforms['uWidth']
  if (width != null) width.value = ROUTE_CSS_PX * px
}
