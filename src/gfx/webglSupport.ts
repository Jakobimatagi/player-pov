/** True when the browser can create a WebGL2 or WebGL1 context. */
export function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return gl != null
  } catch {
    return false
  }
}
