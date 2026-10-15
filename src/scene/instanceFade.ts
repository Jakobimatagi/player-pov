import type { Material } from 'three'

/** Per-instance opacity. One opaque material, no extra draw call. */
export function withInstanceFade<T extends Material>(material: T): T {
  material.transparent = false
  material.depthWrite = true
  const previous = material.onBeforeCompile?.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aFade;\nvarying float vFade;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
if (vFade < 0.999) {
  float fadeDither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  if (fadeDither > vFade) discard;
}`,
      )
  }
  const previousKey = material.customProgramCacheKey?.bind(material)
  material.customProgramCacheKey = () => `${previousKey?.() ?? ''}|instance-dither`
  return material
}
